/**
 * 길찾기 링크가 정말 그 목적지를 가리키는지 확인.
 *
 *   node scripts/probe-map-urls.mjs
 *
 * 좌표 순서를 뒤집어도 링크는 200 을 주기 때문에(SPA), 실제로 브라우저에
 * 띄워서 화면에 목적지 이름이 나오는지 봐야 해요. 강남역(37.4979, 127.0276)로
 * 확인합니다 — 위도·경도를 뒤집으면 중국 어딘가가 나와요.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const NAME = "강남역";
const LAT = 37.4979;
const LNG = 127.0276;
const enc = encodeURIComponent(NAME);

const urls = [
  ["네이버 신형 (lng,lat)", `https://map.naver.com/p/directions/-/${LNG},${LAT},${enc}/-/walk`],
  ["네이버 신형 (lat,lng 뒤집음)", `https://map.naver.com/p/directions/-/${LAT},${LNG},${enc}/-/walk`],
  ["카카오맵", `https://map.kakao.com/link/to/${enc},${LAT},${LNG}`],
  [
    "구글 지도",
    `https://www.google.com/maps/dir/?api=1&destination=${LAT},${LNG}&travelmode=walking`,
  ],
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
for (const [label, url] of urls) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  );
  await page.setViewport({ width: 390, height: 844 });
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  } catch {
    /* 타임아웃이어도 그 시점의 화면을 봐요 */
  }
  await new Promise((r) => setTimeout(r, 4000));
  const text = await page.evaluate(() => document.body?.innerText?.slice(0, 600) ?? "");
  const hit = text.includes(NAME);
  console.log(`\n===== ${label} — 목적지 이름 표시: ${hit ? "있음" : "없음"}`);
  console.log(text.replace(/\n{2,}/g, "\n").slice(0, 300));
  await page.close();
}
await browser.close();
