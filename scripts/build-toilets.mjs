/**
 * 공중화장실 원장 만들기 (1회성 배치)
 *
 *   # 권장 — 오픈API로 직접 받아요. 수동 다운로드가 필요 없어요.
 *   DATA_KEY=공공데이터포털키 VWORLD_KEY=브이월드키 node scripts/build-toilets.mjs
 *
 *   # API 응답 필드부터 확인하고 싶을 때
 *   DATA_KEY=공공데이터포털키 node scripts/build-toilets.mjs --probe
 *
 *   # 이미 받아둔 CSV 가 있으면
 *   VWORLD_KEY=브이월드키 node scripts/build-toilets.mjs data/toilets.csv
 *
 * 하는 일
 *   1. 오픈API(또는 CSV)에서 화장실 목록 읽기
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

/** 평일만 여는 곳을 가리키는 표기. */
const WEEKDAY = /평일|주중|월~금|월-금|월∼금/;
/**
 * 주말 구간이 따로 적혀 있는지.
 * "(토)" 를 `토\)` 로 쓰면 "(평일)" 의 "일)" 에도 걸려요 — 여는 괄호까지 요구합니다.
 */
const WEEKEND = /주말|토요|일요|\(토\)|\(일\)/;
/** 그 구간이 "닫는다"는 뜻인지. */
const CLOSED = /미개방|닫힘|휴무|없음|불가/;

const RANGE =
  /(\d{1,2})\s*[:시]?\s*(\d{2})?\s*[~\-–∼]\s*(\d{1,2})\s*[:시]?\s*(\d{2})?/;

/** "9", "18" + "00" → "0900" / "1800". 말이 안 되면 null. */
function pad(h, mm) {
  const hh = Number(h);
  const mi = Number(mm ?? "0");
  if (!Number.isFinite(hh) || hh > 24 || mi > 59) return null;
  // "24:00" 은 자정을 뜻해요. 0시로 접습니다.
  return `${String(hh % 24).padStart(2, "0")}${String(mi).padStart(2, "0")}`;
}

/** 문자열에서 첫 시각 범위 하나를 뽑아 "HHMM-HHMM" 으로. 없으면 null. */
function firstRange(s) {
  const m = s.match(RANGE);
  if (m == null) return null;
  const a = pad(m[1], m[2]);
  const b = pad(m[3], m[4]);
  if (a == null || b == null) return null;
  // 00:00~24:00 처럼 하루를 통째로 적어둔 것도 24시간이에요.
  if (a === b) return "24";
  return `${a}-${b}`;
}

/**
 * 자유 텍스트 개방시간 → "24" | "HHMM-HHMM" | "평일|주말" | ""
 *
 * 실제로 들어오는 값들(상위 빈도순):
 *   "상시", "정시 09:00~18:00", "(평일)09:00~18:00",
 *   "(평일)09:00-18:00+(주말)09:00-18:00", "평일,주말: 06:00~24:00",
 *   "(평일)06:00-24:00+(주말)상시닫힘", "09:00~18:00 주말및공휴일 미개방",
 *   "정시 9시간", "불규칙", "미개방", ""
 *
 * 평일 표기가 있으면 주말 구간을 따로 찾아서 "평일|주말" 로 담아요.
 * 주말이 닫힘이거나 아예 안 적혀 있으면 주말 칸을 비웁니다.
 *
 * ponytail: 요일 축은 평일/주말 둘로만 나눠요. 요일마다 다른 곳은
 *           데이터에 거의 없고, 있어도 평일 구간으로 읽힙니다.
 */
export function normalizeHours(raw) {
  const s = (raw ?? "").trim();
  if (s === "" || s === "-") return "";
  // 요일을 전혀 안 가리고 종일 여는 곳.
  if (ALL_DAY.test(s) && firstRange(s) == null) return "24";

  // "+" 나 쉼표로 평일 구간과 주말 구간이 나뉘어 있는 경우가 많아요.
  const parts = s.split(/[+,]/).map((p) => p.trim()).filter((p) => p !== "");
  const weekendPart = parts.find((p) => WEEKEND.test(p));
  // 평일 조각: 평일 표기가 있는 것 우선, 없으면 주말을 말하지 않는 조각.
  const weekdayPart =
    parts.find((p) => WEEKDAY.test(p)) ??
    parts.find((p) => !WEEKEND.test(p)) ??
    s;

  let base = firstRange(weekdayPart) ?? "";
  if (base === "" && ALL_DAY.test(weekdayPart)) base = "24";
  if (base === "") {
    // "평일,주말: 06:00~24:00" 처럼 시각이 주말 조각에만 붙어 있는 표기 —
    // 두 요일이 같은 시간을 쓴다는 뜻이에요.
    return weekendPart != null ? (firstRange(weekendPart) ?? "") : "";
  }

  if (weekendPart == null) {
    // 주말 얘기가 아예 없어요. 평일이라고 적혀 있으면 평일만 여는 곳이고,
    // 그런 말도 없으면 요일을 안 가리는 곳이에요.
    return WEEKDAY.test(s) ? `${base}|` : base;
  }
  // "(주말)상시닫힘", "주말및공휴일 미개방" 처럼 닫는다고 적힌 경우.
  if (CLOSED.test(weekendPart)) return `${base}|`;

  const weekend = firstRange(weekendPart);
  if (weekend == null) return base;
  return base === weekend ? base : `${base}|${weekend}`;
}

/* ------------------------------- 지오코딩 --------------------------------- */

/**
 * 캐시 키는 "타입:주소" 예요.
 * 예전 캐시는 도로명으로만 조회해서 키에 타입이 없었어요 — 읽으면서 옮깁니다.
 */
function loadCache() {
  if (!existsSync(CACHE_FILE)) return {};
  const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.includes(":") ? k : `ROAD:${k}`] = v;
  }
  return out;
}

const cache = loadCache();

let sinceSave = 0;
function remember(cacheKey, value) {
  cache[cacheKey] = value;
  if (++sinceSave >= 300) {
    writeFileSync(CACHE_FILE, JSON.stringify(cache));
    sinceSave = 0;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * VWorld 지오코더 한 번 호출.
 * @param type ROAD(도로명) 또는 PARCEL(지번)
 */
async function geocodeOne(addr, type, key) {
  const cacheKey = `${type}:${addr}`;
  if (cacheKey in cache) return cache[cacheKey];

  const url =
    "https://api.vworld.kr/req/address?service=address&request=getcoord" +
    `&version=2.0&crs=EPSG:4326&type=${type}&format=json&key=${key}` +
    `&address=${encodeURIComponent(addr)}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    // 다른 워커가 서버 오류를 만났으면 같이 쉬어요. 혼자만 계속 두들기면
    // 제한이 안 풀립니다.
    await waitCooldown();
    try {
      const res = await fetch(url);
      const text = await res.text();

      if (text.startsWith("{")) {
        const json = JSON.parse(text);
        if (json?.response?.status === "OK") {
          const p = json.response.result.point;
          const v = [Number(p.y), Number(p.x)]; // [위도, 경도]
          consecutiveServerErrors = 0;
          remember(cacheKey, v);
          return v;
        }
        // 주소가 없는 건 다시 물어도 없어요. 이건 캐시해도 됩니다.
        if (json?.response?.status === "NOT_FOUND") {
          consecutiveServerErrors = 0;
          remember(cacheKey, null);
          return null;
        }
      }
      // JSON 이 아니면 502 같은 서버 오류거나 주소 형식이 깨진 거예요.
      // 둘을 구분할 수 없어서 캐시하지 않고 재시도합니다.
    } catch {
      /* 소켓이 끊기는 일이 잦아요. 재시도합니다. */
    }
    // 서버가 밀어냈으니 모두 함께 쉬어요.
    cooldownUntil = Date.now() + COOLDOWN_MS;
    await sleep(700 * (attempt + 1));
  }

  /*
   * 여기까지 왔으면 서버가 계속 안 받아준 거예요.
   * 캐시에 실패로 남기면 안 됩니다 — 일시적인 장애가 영구 실패로 굳어서,
   * 다시 돌려도 그 주소는 영영 안 찍혀요. 실제로 그래서 성공률이 50% 였습니다.
   *
   * 이게 연달아 나면 하루 4만 건 한도를 쓴 거예요. 계속 두들겨봐야
   * 시간만 버리고 차단만 길어지니 배치를 접습니다. 내일 이어서 돌리면 돼요.
   */
  if (++consecutiveServerErrors >= GIVE_UP_AFTER) throw new QuotaExhausted();
  return null;
}

/**
 * 주소를 다듬어요. 호출 한도가 하루 4만 건이라 한 번에 맞히는 게 중요해요.
 *
 * - 쉼표 뒤 상세주소("3층 동편계단")를 떼요. 붙어 있으면 못 찾아요.
 * - "청계천로307" 처럼 도로명과 번호가 붙어 있으면 띄어써요.
 */
export function cleanAddress(a) {
  return (a ?? "")
    .split(",")[0]
    .replace(/([가-힣]+(?:대?로|길))(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * VWorld 는 하루 한도(4만) 말고 순간 부하 제한도 걸어요.
 * 몰아치면 502 를 뱉다가 잠시 쉬면 다시 받아줍니다.
 *
 * 그래서 서버 오류가 나면 바로 접지 말고 모든 워커를 함께 재웠다가 이어가요.
 * 쉬어도 계속 안 되면 그때가 진짜 하루 한도예요.
 */
let cooldownUntil = 0;
let consecutiveServerErrors = 0;
export class QuotaExhausted extends Error {}

const COOLDOWN_MS = 30_000;
/** 쉬어도 이만큼 연달아 실패하면 하루치를 다 쓴 거예요. */
const GIVE_UP_AFTER = 40;

async function waitCooldown() {
  const left = cooldownUntil - Date.now();
  if (left > 0) await sleep(left);
}

/**
 * 도로명 → 지번 순으로 시도해요.
 *
 * 이 데이터는 지번주소만 있는 줄이 5천 건 넘는데, 지번을 도로명 파서에 넣으면
 * 전부 NOT_FOUND 로 떨어져요. 실제로 그래서 성공률이 61% 였어요.
 */
async function geocode(road, jibun, key) {
  const r = cleanAddress(road);
  if (r !== "") {
    const v = await geocodeOne(r, "ROAD", key);
    if (v != null) return v;
  }
  const j = cleanAddress(jibun);
  // 도로명과 지번이 같으면 두 번 부를 이유가 없어요.
  if (j !== "" && j !== r) {
    const v = await geocodeOne(j, "PARCEL", key);
    if (v != null) return v;
  }
  return null;
}

/**
 * 동시에 몇 개씩 부를지.
 * 6 으로 올렸더니 VWorld 가 502 를 뱉기 시작했고, 같은 키를 쓰는 지도 타일까지
 * 함께 막혔어요. 배치는 급할 게 없으니 서버가 버티는 선에서 돌립니다.
 */
const CONCURRENCY = 2;

/** 순서를 지키면서 동시에 여러 개를 처리해요. */
async function mapLimit(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/* -------------------------------- 오픈API -------------------------------- */

const API_URL = "http://api.data.go.kr/openapi/tn_pubr_public_toilet_api";

/**
 * 표준데이터 오픈API 응답 필드.
 * --probe 출력과 다르면 여기만 고치세요. 파싱은 전부 이 표를 거칩니다.
 */
const API_FIELD = {
  name: "toiletNm",
  road: "rdnmadr",
  jibun: "lnmadr",
  hours: "openTime",
  kind: "toiletSeNm",
  lat: "latitude",
  lng: "longitude",
};

/** 응답 안 어디에 배열이 들어 있든 찾아내요. 래핑 형태가 오퍼레이션마다 달라요. */
function firstArray(obj) {
  if (Array.isArray(obj)) return obj;
  if (obj == null || typeof obj !== "object") return null;
  for (const v of Object.values(obj)) {
    const found = firstArray(v);
    if (found != null) return found;
  }
  return null;
}

async function apiPage(key, page, perPage) {
  const url =
    `${API_URL}?serviceKey=${key}&pageNo=${page}&numOfRows=${perPage}&type=json`;
  const res = await fetch(url);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // 키가 안 맞으면 JSON 대신 XML 오류가 와요.
    throw new Error(`JSON이 아니에요: ${text.slice(0, 200)}`);
  }
}

/** 오픈API를 끝까지 훑어 표준 모양의 줄 배열로 돌려줘요. */
async function fetchFromApi(key) {
  const perPage = 1000;
  const out = [];
  let page = 1;
  let total = Infinity;

  while (out.length < total) {
    const json = await apiPage(key, page, perPage);
    const items = firstArray(json) ?? [];
    if (page === 1) {
      total = Number(json?.response?.body?.totalCount ?? json?.totalCount ?? items.length);
    }
    if (items.length === 0) break;
    out.push(...items);
    console.log(`  받는 중 ${out.length}/${total}`);
    page++;
    await sleep(120);
  }
  return out.map((it) => ({
    name: String(it[API_FIELD.name] ?? "").trim(),
    road: String(it[API_FIELD.road] ?? "").trim(),
    jibun: String(it[API_FIELD.jibun] ?? "").trim(),
    hours: String(it[API_FIELD.hours] ?? ""),
    kind: String(it[API_FIELD.kind] ?? ""),
    lat: Number(it[API_FIELD.lat]),
    lng: Number(it[API_FIELD.lng]),
  }));
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

/**
 * CSV 를 오픈API 와 같은 모양으로 폅니다. 아래 루프는 출처를 몰라도 되게.
 *
 * localdata.go.kr 의 공중화장실정보 CSV 는 cp949 이고 좌표 칸이 아예 없어요.
 * 개방시간이 두 칸으로 나뉘어 있는 것도 함정이에요:
 *   개방시간구분 = "상시" | "주간" | "기타"
 *   개방시간상세 = "10:30-20:30" | "9시간" | ""
 * "9시간" 은 시각 범위가 아니라 길이라서 그것만 보면 못 읽어요.
 * 두 칸을 붙여 넘기면 "상시"는 24시간으로, 범위가 적힌 것만 범위로 읽힙니다.
 */
function readCsv(csvPath) {
  const buf = readFileSync(csvPath);
  // BOM 이 있으면 UTF-8, 없으면 cp949 로 봅니다.
  const isUtf8 = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const text = new TextDecoder(isUtf8 ? "utf-8" : "euc-kr").decode(buf);
  console.log(`  인코딩: ${isUtf8 ? "UTF-8" : "cp949"}`);

  const rows = parseCsv(text);
  const header = rows[0].map((h) => h.trim().replace(/^﻿/, ""));
  const iName = pick(header, "화장실명");
  const iRoad = pick(header, "소재지도로명주소");
  const iJibun = pick(header, "소재지지번주소");
  // 이름이 헷갈려요. "개방시간" 이 구분(정시/상시/미개방)이고,
  // 실제 시각은 "개방시간상세" 에 있어요.
  const iHourKind = pick(header, "개방시간", "개방시간구분");
  const iHourDetail = pick(header, "개방시간상세");
  const iKind = pick(header, "구분명", "구분");
  const iLat = pick(header, "위도", "WGS84위도");
  const iLng = pick(header, "경도", "WGS84경도");

  if (iName < 0 || (iRoad < 0 && iJibun < 0)) {
    console.error("필요한 칸을 못 찾았어요. 헤더:", header.join(" | "));
    process.exit(1);
  }

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < header.length - 2) continue;
    const hourKind = iHourKind >= 0 ? (r[iHourKind] ?? "") : "";
    const hourDetail = iHourDetail >= 0 ? (r[iHourDetail] ?? "") : "";
    out.push({
      name: (r[iName] ?? "").trim(),
      road: (r[iRoad] ?? "").trim(),
      jibun: (r[iJibun] ?? "").trim(),
      hours: `${hourKind} ${hourDetail}`.trim(),
      kind: r[iKind] ?? "",
      lat: iLat >= 0 ? Number(r[iLat]) : NaN,
      lng: iLng >= 0 ? Number(r[iLng]) : NaN,
    });
  }
  return out;
}

async function main() {
  const csvPath = process.argv[2];
  const dataKey = process.env.DATA_KEY;
  const key = process.env.VWORLD_KEY;

  if (csvPath == null && dataKey == null) {
    console.error("DATA_KEY(공공데이터포털) 를 넣거나 CSV 경로를 주세요.");
    console.error("데이터: https://www.data.go.kr/data/15012892/standard.do");
    process.exit(1);
  }

  console.log(csvPath != null ? `CSV 읽는 중: ${csvPath}` : "오픈API 에서 받는 중…");
  const records = csvPath != null ? readCsv(csvPath) : await fetchFromApi(dataKey);
  console.log(`원본 ${records.length}건`);

  // 1) 쓸 줄만 남겨요.
  let excluded = 0;
  const keep = records.filter((rec) => {
    if (rec.name === "") return false;
    // 미개방으로 적힌 곳은 아예 빼요. "시간 정보 없음" 으로 두면
    // 목록에서 열린 곳 바로 아래에 올라와 헛걸음을 시킵니다.
    if (String(rec.hours).includes("미개방")) { excluded++; return false; }
    // 이동화장실은 행사용 임시 설치라 주소로 찍은 좌표를 믿을 수 없어요.
    if (String(rec.kind).includes("이동")) { excluded++; return false; }
    return true;
  });

  // 2) 좌표가 없는 줄을 병렬로 찍어요. 한 건씩 순서대로 부르면 몇 시간 걸려요.
  const needGeo = keep.filter((r) => !isKoreaCoord(r.lat, r.lng));
  if (needGeo.length > 0 && key != null) {
    const already = needGeo.filter((r) => isKoreaCoord(r.lat, r.lng)).length;
    console.log(
      `좌표 찍을 줄 ${needGeo.length}건 (동시 ${CONCURRENCY}개, 이미 확보 ${already}건)`,
    );
    let done = 0;
    try {
      await mapLimit(needGeo, CONCURRENCY, async (rec) => {
        const got = await geocode(rec.road, rec.jibun, key);
        if (got != null) [rec.lat, rec.lng] = got;
        if (++done % 1000 === 0) {
          const hit = keep.filter((r) => isKoreaCoord(r.lat, r.lng)).length;
          console.log(`  ${done}/${needGeo.length}  (좌표 확보 ${hit}건)`);
        }
      });
    } catch (e) {
      if (!(e instanceof QuotaExhausted)) throw e;
      console.warn(
        `
하루 호출 한도를 쓴 것 같아요 (${done}/${needGeo.length} 까지 진행).
` +
        `찍어둔 좌표는 캐시에 남아 있어요. 내일 같은 명령을 다시 치면 이어서 갑니다.
` +
        `지금까지 확보한 만큼으로 격자를 만들어 둘게요.`,
      );
    }
    writeFileSync(CACHE_FILE, JSON.stringify(cache));
  }

  // 3) 격자에 담아요.
  const cells = new Map();
  let dropped = 0;
  for (const rec of keep) {
    const { lat, lng } = rec;
    if (!isKoreaCoord(lat, lng)) { dropped++; continue; }

    const hours = normalizeHours(rec.hours);
    // 0 = 공중화장실, 1 = 개방화장실(민간·공공이 열어준 곳), 2 = 간이화장실
    const k2 = String(rec.kind);
    const kind = k2.includes("공중") ? 0 : k2.includes("간이") ? 2 : 1;

    const k = `${Math.floor(lat / CELL)}_${Math.floor(lng / CELL)}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push([round6(lat), round6(lng), rec.name, hours, kind]);
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
  console.log(`제외 ${excluded}건 (미개방·이동화장실)`);
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

/** 오픈API 응답을 눈으로 확인해요. 필드명이 다르면 API_FIELD 만 고치면 됩니다. */
async function probe() {
  const dataKey = process.env.DATA_KEY;
  if (dataKey == null) {
    console.error("DATA_KEY 가 필요해요.");
    process.exit(1);
  }
  const json = await apiPage(dataKey, 1, 2);
  const items = firstArray(json) ?? [];
  console.log("총건수:", json?.response?.body?.totalCount ?? json?.totalCount);
  console.log(JSON.stringify(items[0], null, 2));
  if (items[0] != null) {
    console.log("\n현재 표로 읽으면:");
    console.log({
      name: items[0][API_FIELD.name],
      road: items[0][API_FIELD.road],
      hours: items[0][API_FIELD.hours],
      normalized: normalizeHours(items[0][API_FIELD.hours] ?? ""),
      lat: items[0][API_FIELD.lat],
      lng: items[0][API_FIELD.lng],
    });
  }
}

/* 자체 점검 — 개방시간 정규화가 이 앱의 유일한 진짜 로직이에요.
   아래 값들은 전부 실제 CSV 에서 그대로 가져온 문자열입니다. */
export function demo() {
  const eq = (got, want) => {
    if (got !== want) throw new Error(`${JSON.stringify(got)} !== ${JSON.stringify(want)}`);
  };

  // 요일을 안 가리는 값
  eq(normalizeHours("상시"), "24");
  eq(normalizeHours("상시 9시간"), "24");
  eq(normalizeHours("24시간"), "24");
  eq(normalizeHours("연중무휴"), "24");
  eq(normalizeHours("정시 09:00~18:00"), "0900-1800");
  eq(normalizeHours("정시 09:00-18:00"), "0900-1800");
  eq(normalizeHours("정시 9시간"), "");
  eq(normalizeHours("불규칙"), "");
  eq(normalizeHours("정시"), "");
  eq(normalizeHours(""), "");
  eq(normalizeHours("-"), "");
  eq(normalizeHours("정시 00:00~24:00"), "24");
  eq(normalizeHours("정시 22:00~04:00"), "2200-0400");
  eq(normalizeHours("정시 10:30-20:30"), "1030-2030");

  // 평일만 여는 곳 — 주말 칸을 비워요
  eq(normalizeHours("정시 (평일)09:00~18:00"), "0900-1800|");
  eq(normalizeHours("정시 (평일)09:00-18:00"), "0900-1800|");
  eq(normalizeHours("정시 월~금 09시~18시"), "0900-1800|");
  eq(normalizeHours("정시 평일 09:00~18:00"), "0900-1800|");
  eq(normalizeHours("정시 평일(09:00~18:00)"), "0900-1800|");
  eq(normalizeHours("정시 09:00~18:00(평일)"), "0900-1800|");
  eq(normalizeHours("정시 (월~금)09:00~18:00"), "0900-1800|");
  eq(normalizeHours("정시 월~금 09~18시"), "0900-1800|");

  // 주말이 닫힌다고 적힌 경우도 평일만
  // 24:00 은 자정이라 "0000" 으로 접어요. "2400" 으로 두면 앱에서 못 읽어요.
  eq(normalizeHours("정시 (평일)06:00-24:00+(주말)상시닫힘"), "0600-0000|");
  eq(normalizeHours("정시 09:00~18:00 주말및공휴일 미개방"), "0900-1800|");
  eq(normalizeHours("정시 (평일)09:00-18:00+공휴일, 국경일 미개방"), "0900-1800|");

  // 주말도 같은 시간이면 요일을 안 가리는 것과 같아요
  eq(normalizeHours("정시 (평일)09:00-18:00+(주말)09:00-18:00"), "0900-1800");
  eq(normalizeHours("정시 (평일)09:00~18:00+(주말)09:00~18:00"), "0900-1800");
  eq(normalizeHours("정시 평일,주말: 06:00~24:00"), "0600-0000");
  eq(normalizeHours("정시 (평일)06:00-21:00+(주말)06:00-21:00"), "0600-2100");

  // 주말 시간이 다르면 둘 다 담아요
  eq(normalizeHours("정시 (평일)09:00~20:00+(주말)09:00~18:00"), "0900-2000|0900-1800");
  eq(normalizeHours("정시 (평일)09:00-22:00+(주말)09:00-22:00"), "0900-2200");

  // 주소 다듬기 — 호출 한도가 빠듯해서 한 번에 맞히는 게 중요해요.
  eq(cleanAddress("서울특별시 종로구 청계천로307, 3층 동편계단"), "서울특별시 종로구 청계천로 307");
  eq(cleanAddress("서울특별시 종로구 세종대로 110"), "서울특별시 종로구 세종대로 110");
  eq(cleanAddress("경기도 성남시 분당구 판교역로235"), "경기도 성남시 분당구 판교역로 235");
  eq(cleanAddress("서울특별시 종로구 삼청동  산2-1 "), "서울특별시 종로구 삼청동 산2-1");
  eq(cleanAddress(""), "");

  console.log("build-toilets normalizeHours OK");
}

if (process.argv[2] === "--check") demo();
else if (process.argv[2] === "--probe") probe();
else if (process.argv[1]?.endsWith("build-toilets.mjs")) main();
