/**
 * 앱 아이콘 600×600 생성기.
 *
 *   node scripts/gen-icon.mjs            → assets/icon-candidates/*.png
 *   node scripts/gen-icon.mjs --pick a   → 고른 안을 assets/icon.png 로 덮어써요
 *
 * 옆에서 본 변기 모양이에요. 배설물은 그리지 않습니다 — 그걸 넣은 판이
 * "로고에 사용하기 부적절할 수 있는 표현"으로 반려됐어요(2026-08-16).
 * 토스가 모서리를 알아서 깎으니 라운드·여백 없이 꽉 채웁니다.
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const S = 600;
const OUT = resolve(process.cwd(), "assets/icon-candidates");

const args = process.argv.slice(2);
const pick = args.includes("--pick") ? args[args.indexOf("--pick") + 1] : null;

/** 지금 쓰는 아이콘과 같은 파랑 계열이에요. */
const bg = `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#3B82F6"/><stop offset="1" stop-color="#1D4ED8"/>
    </linearGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#sky)"/>`;

/**
 * 옆에서 본 변기. 물탱크(뒤) + 좌대 + 변기통 + 받침.
 * 작게 줄여도 형태가 뭉치지 않게 각 덩어리를 굵게 잡고 사이를 띄웠어요.
 */
const toilet = (fill = "#FFFFFF") => `
  <!-- 물탱크 -->
  <rect x="118" y="132" width="132" height="176" rx="20" fill="${fill}"/>
  <!-- 좌대(변기 뚜껑) — 앞으로 길게 나와요 -->
  <rect x="118" y="322" width="352" height="56" rx="28" fill="${fill}"/>
  <!-- 변기통 — 아래로 좁아져요 -->
  <path d="M170 392 H430 C430 470 392 508 300 508 C208 508 170 470 170 392 Z" fill="${fill}"/>
  <!-- 받침 -->
  <rect x="232" y="494" width="136" height="42" rx="16" fill="${fill}"/>`;

/**
 * 진짜 옆모습. 물탱크는 뒤(왼쪽)에 서 있고, 좌대가 앞으로 뻗고, 변기통은
 * 좌대 아래에서 앞쪽으로 치우쳐 내려와 발받침으로 이어져요.
 */
const toiletSide = (fill = "#FFFFFF") => `
  <rect x="112" y="130" width="120" height="182" rx="20" fill="${fill}"/>
  <rect x="112" y="326" width="360" height="54" rx="27" fill="${fill}"/>
  <path d="M196 394 H438 C438 452 414 492 372 508 V536 H256 V508 C214 492 196 452 196 394 Z" fill="${fill}"/>`;

const variants = {
  // A. 변기만. 가장 단순해서 목록에서 형태가 바로 읽혀요.
  a: `${bg}${toilet()}`,

  // D. 옆모습 + 물내림 버튼.
  d: `${bg}
    ${toiletSide()}
    <circle cx="172" cy="184" r="21" fill="#1D4ED8"/>`,

  // E. 옆모습만.
  e: `${bg}${toiletSide()}`,

  // B. 변기 + 물내림 버튼. 물탱크가 그냥 상자로 보이지 않게 점 하나를 얹었어요.
  b: `${bg}
    ${toilet()}
    <circle cx="184" cy="186" r="22" fill="#1D4ED8"/>`,

  // C. 변기 + 위치 표시. "찾는 앱"이라는 걸 같이 말해줘요.
  c: `${bg}
    <g transform="translate(-26,18) scale(0.92)">${toilet()}</g>
    <g transform="translate(392,96)">
      <path d="M74 0 C114 0 148 33 148 74 C148 128 74 186 74 186 C74 186 0 128 0 74 C0 33 34 0 74 0 Z" fill="#FFFFFF"/>
      <circle cx="74" cy="74" r="34" fill="#1D4ED8"/>
    </g>`,
};

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: S, height: S, deviceScaleFactor: 1 });

for (const [key, body] of Object.entries(variants)) {
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style>
     <svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${body}</svg>`,
  );
  await page.screenshot({ path: resolve(OUT, `icon-${key}.png`) });
  console.log(`assets/icon-candidates/icon-${key}.png`);
}

await browser.close();

if (pick != null) {
  copyFileSync(resolve(OUT, `icon-${pick}.png`), resolve(process.cwd(), "assets/icon.png"));
  console.log(`assets/icon.png <- icon-${pick}.png`);
}
