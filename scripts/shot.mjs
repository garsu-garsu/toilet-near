/**
 * 화면 확인용 스크린샷(636x1048 — 콘솔 제출 규격).
 *
 *   npx vite preview --port 4173 --strictPort   (다른 창에서 띄워두고)
 *   node scripts/shot.mjs
 *
 * 토스 앱이 아니라 그냥 브라우저라 Device.getLocation 이 없어요.
 * 그래서 앱이 쓰는 브릿지를 가짜로 심어 서울시청 좌표를 물려줍니다 —
 * 지도 타일과 핀이 실제로 그려지는지 여기서 먼저 걸러내려는 거예요.
 */
import { mkdir } from "node:fs/promises";

import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const PAGE_URL = process.env.BASE_URL ?? "http://localhost:4173/";
const OUT = "screenshots";
const SIZE = { width: 636, height: 1048, deviceScaleFactor: 1 };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [`--window-size=${SIZE.width},${SIZE.height}`],
});

try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport(SIZE);

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // 타일이 막히면 여기서 잡혀요. 이게 이 스크립트의 핵심이에요.
  const failedTiles = [];
  page.on("requestfailed", (r) => {
    if (r.url().includes("wmts") || r.url().includes("tile")) failedTiles.push(r.url());
  });
  page.on("response", (r) => {
    const u = r.url();
    if ((u.includes("wmts") || u.includes("tile")) && r.status() >= 400) {
      failedTiles.push(`${r.status()} ${u}`);
    }
  });

  // 서울시청. 샘플 데이터가 이 근처에 몰려 있어요.
  // 토스 브릿지가 없는 브라우저에서는 앱이 표준 geolocation 으로 넘어가요.
  await browser.defaultBrowserContext().overridePermissions(new URL(PAGE_URL).origin, [
    "geolocation",
  ]);
  await page.setGeolocation({ latitude: 37.5665, longitude: 126.978 });

  await page.goto(PAGE_URL, { waitUntil: "networkidle2", timeout: 30000 });
  // 위치 브릿지가 없으면 앱이 "위치를 확인하지 못했어요" 로 떨어져요.
  // 그 화면도 그대로 찍어서 무엇이 보이는지 확인합니다.
  await new Promise((r) => setTimeout(r, 3500));

  await page.screenshot({ path: `${OUT}/1-map.png` });

  // 목록 탭
  const tabs = await page.$$("nav button");
  if (tabs.length >= 2) {
    await tabs[1].click();
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: `${OUT}/2-list.png` });
  }

  console.log(`스크린샷 ${OUT}/ 에 저장`);
  console.log("타일 실패:", failedTiles.length === 0 ? "없음" : failedTiles.slice(0, 5));
  console.log("페이지 오류:", errors.length === 0 ? "없음" : errors.slice(0, 3));
} finally {
  await browser.close();
}
