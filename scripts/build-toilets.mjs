/**
 * 공중화장실 원장 만들기 (1회성 배치)
 *
 *   node scripts/build-toilets.mjs data/전국공중화장실표준데이터.csv
 *
 * 하는 일
 *   1. CSV 읽기
 *   2. 좌표가 없으면 도로명주소로 지오코딩 (VWorld)
 *   3. 개방시간을 "24" / "0900-1800" / "" 셋 중 하나로 줄이기
 *   4. 0.05도 격자로 쪼개 public/data/cells/{y}_{x}.json 로 저장
 *
 * ⚠️ 왜 지오코딩이 필요한가
 *   2025년 2월부터 이 표준데이터에서 WGS84 위도·경도 제공이 중단됐어요.
 *   주소만 남아서 직접 좌표를 찍어야 해요.
 *   카카오·네이버 지오코딩 결과를 원장으로 저장하는 건 약관 위반이라 못 씁니다.
 *   국토부 VWorld 는 공공데이터라 저장·재배포가 됩니다.
 *
 *   VWORLD_KEY 를 환경변수로 넣어주세요. (https://www.vworld.kr 에서 발급, 무료)
 *   $ VWORLD_KEY=xxxx node scripts/build-toilets.mjs data/toilets.csv
 *
 * 캐시
 *   지오코딩 결과는 scripts/.geocache.json 에 쌓여요. 중간에 끊고 다시 돌려도
 *   이미 찍은 주소는 다시 안 부릅니다. 6만 건이라 이게 없으면 재시작이 지옥이에요.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../public/data/cells");
const CACHE_FILE = resolve(HERE, ".geocache.json");
const CELL = 0.05;

/* ---------------------------------- CSV ---------------------------------- */

/** 따옴표 안의 쉼표를 지켜주는 최소 CSV 파서. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/* ------------------------------- 개방시간 --------------------------------- */

const ALL_DAY = /24\s*시간|상시|연중|항상|24h/i;

/**
 * 자유 텍스트 개방시간 → "24" | "HHMM-HHMM" | ""
 *
 * 실제로 들어오는 값들:
 *   "24시간", "상시개방", "09:00 ~ 18:00", "09:00-18:00", "0900~1800",
 *   "하절기 05:00~22:00 동절기 06:00~21:00", "미개방", "", "-"
 *
 * 여러 구간이 적혀 있으면 첫 구간만 씁니다. 계절별 구분까지 다루면
 * 데이터 품질 대비 코드가 너무 무거워져요.
 * ponytail: 첫 구간만 채택. 계절별 분리가 필요하면 값을 배열로 늘리세요.
 */
export function normalizeHours(raw) {
  const s = (raw ?? "").trim();
  if (s === "" || s === "-") return "";
  if (ALL_DAY.test(s)) return "24";

  const m = s.match(/(\d{1,2})\s*[:시]?\s*(\d{2})?\s*[~\-–]\s*(\d{1,2})\s*[:시]?\s*(\d{2})?/);
  if (m == null) return "";

  const pad = (h, mm) => {
    const hh = Number(h);
    const mi = Number(mm ?? "0");
    if (!Number.isFinite(hh) || hh > 24 || mi > 59) return null;
    // "24:00" 은 자정을 뜻해요. 0시로 접습니다.
    return `${String(hh % 24).padStart(2, "0")}${String(mi).padStart(2, "0")}`;
  };
  const a = pad(m[1], m[2]);
  const b = pad(m[3], m[4]);
  if (a == null || b == null) return "";
  // 00:00~24:00 처럼 하루를 통째로 적어둔 것도 24시간이에요.
  if (a === b) return "24";
  return `${a}-${b}`;
}

/* ------------------------------- 지오코딩 --------------------------------- */

const cache = existsSync(CACHE_FILE)
  ? JSON.parse(readFileSync(CACHE_FILE, "utf8"))
  : {};

let sinceSave = 0;
function remember(addr, value) {
  cache[addr] = value;
  if (++sinceSave >= 200) {
    writeFileSync(CACHE_FILE, JSON.stringify(cache));
    sinceSave = 0;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** VWorld 지오코더. 실패하면 null — 그 줄은 버립니다. */
async function geocode(addr, key) {
  if (addr in cache) return cache[addr];

  const url =
    "https://api.vworld.kr/req/address?service=address&request=getcoord" +
    `&version=2.0&crs=EPSG:4326&type=ROAD&format=json&key=${key}` +
    `&address=${encodeURIComponent(addr)}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json?.response?.status === "OK") {
        const p = json.response.result.point;
        const v = [Number(p.y), Number(p.x)]; // [위도, 경도]
        remember(addr, v);
        return v;
      }
      // NOT_FOUND 는 재시도해도 같아요. 바로 포기합니다.
      if (json?.response?.status === "NOT_FOUND") {
        remember(addr, null);
        return null;
      }
    } catch {
      /* 네트워크는 재시도 */
    }
    await sleep(300 * (attempt + 1));
  }
  remember(addr, null);
  return null;
}

/* --------------------------------- main ---------------------------------- */

/** 헤더 이름이 연도마다 조금씩 달라서 후보를 여러 개 둡니다. */
function pick(header, ...names) {
  for (const n of names) {
    const i = header.findIndex((h) => h.replace(/\s/g, "") === n);
    if (i >= 0) return i;
  }
  return -1;
}

async function main() {
  const csvPath = process.argv[2];
  if (csvPath == null) {
    console.error("사용법: node scripts/build-toilets.mjs <csv경로>");
    console.error("데이터: https://www.data.go.kr/data/15012892/standard.do");
    process.exit(1);
  }
  const key = process.env.VWORLD_KEY;

  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  const header = rows[0].map((h) => h.trim());
  const iName = pick(header, "화장실명");
  const iRoad = pick(header, "소재지도로명주소");
  const iJibun = pick(header, "소재지지번주소");
  const iHours = pick(header, "개방시간", "개방시간상세");
  const iKind = pick(header, "구분");
  const iLat = pick(header, "위도", "WGS84위도");
  const iLng = pick(header, "경도", "WGS84경도");

  if (iName < 0 || (iRoad < 0 && iJibun < 0)) {
    console.error("필요한 칸을 못 찾았어요. 헤더:", header.join(" | "));
    process.exit(1);
  }

  const cells = new Map();
  let geocoded = 0;
  let dropped = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < header.length - 2) continue;

    const name = (r[iName] ?? "").trim();
    if (name === "") continue;

    let lat = iLat >= 0 ? Number(r[iLat]) : NaN;
    let lng = iLng >= 0 ? Number(r[iLng]) : NaN;

    // 2025년 2월 이후 데이터에는 좌표 칸이 비어 있어요.
    if (!isKoreaCoord(lat, lng)) {
      const addr = (r[iRoad] ?? "").trim() || (r[iJibun] ?? "").trim();
      if (addr === "" || key == null) { dropped++; continue; }
      const got = await geocode(addr, key);
      if (got == null) { dropped++; continue; }
      [lat, lng] = got;
      if (!isKoreaCoord(lat, lng)) { dropped++; continue; }
      if (++geocoded % 500 === 0) console.log(`  지오코딩 ${geocoded}건…`);
    }

    const hours = normalizeHours(r[iHours] ?? "");
    // "구분" 이 공중화장실이 아니면 개방화장실(관공서 등)로 봅니다.
    const kind = (r[iKind] ?? "").includes("공중") ? 0 : 1;

    const k = `${Math.floor(lat / CELL)}_${Math.floor(lng / CELL)}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push([round6(lat), round6(lng), name, hours, kind]);
  }

  writeFileSync(CACHE_FILE, JSON.stringify(cache));

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  let total = 0;
  for (const [k, list] of cells) {
    writeFileSync(`${OUT_DIR}/${k}.json`, JSON.stringify(list));
    total += list.length;
  }

  console.log(`화장실 ${total}건 / 격자 ${cells.size}칸 저장`);
  console.log(`버린 줄 ${dropped}건 (주소 없음 또는 좌표 못 찾음)`);
  if (key == null) {
    console.warn("VWORLD_KEY 가 없어서 좌표 없는 줄은 전부 버렸어요.");
  }
}

/** 대한민국 밖 좌표는 데이터 오류예요. */
function isKoreaCoord(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat > 33 && lat < 39 && lng > 124 && lng < 132
  );
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/* 자체 점검 — 개방시간 정규화가 이 앱의 유일한 진짜 로직이에요. */
export function demo() {
  const eq = (got, want) => {
    if (got !== want) throw new Error(`${got} !== ${want}`);
  };
  eq(normalizeHours("24시간"), "24");
  eq(normalizeHours("상시개방"), "24");
  eq(normalizeHours("연중무휴"), "24");
  eq(normalizeHours(""), "");
  eq(normalizeHours("-"), "");
  eq(normalizeHours("미개방"), "");
  eq(normalizeHours("09:00 ~ 18:00"), "0900-1800");
  eq(normalizeHours("09:00-18:00"), "0900-1800");
  eq(normalizeHours("9시~18시"), "0900-1800");
  eq(normalizeHours("0530~2230"), "0530-2230");
  eq(normalizeHours("하절기 05:00~22:00 동절기 06:00~21:00"), "0500-2200");
  eq(normalizeHours("00:00~24:00"), "24");
  eq(normalizeHours("22:00~04:00"), "2200-0400");
  console.log("build-toilets normalizeHours OK");
}

if (process.argv[2] === "--check") demo();
else if (process.argv[1]?.endsWith("build-toilets.mjs")) main();
