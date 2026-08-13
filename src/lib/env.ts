export const AD_GROUP_ID_BANNER = import.meta.env.VITE_AD_GROUP_ID_BANNER ?? "";
export const AD_GROUP_ID_BANNER_IMAGE =
  import.meta.env.VITE_AD_GROUP_ID_BANNER_IMAGE ?? "";

/**
 * VWorld 인증키. 배경지도 타일에 써요.
 * 지도 타일 키는 브라우저가 직접 부르는 값이라 번들에 들어가는 게 정상이에요
 * (카카오 JS 키도 마찬가지). 비밀로 지킬 수 있는 종류의 값이 아니에요.
 */
const VWORLD_KEY = import.meta.env.VITE_VWORLD_KEY ?? "";

/**
 * 배경지도 타일 주소.
 *
 * 기본은 국토교통부 브이월드예요 — 국내 지도 원본이고, 화장실 좌표를 찍는
 * 지오코더와 키가 같아서 따로 발급받을 게 없어요.
 *
 * ⚠️ 브이월드는 인증키에 등록한 서비스 URL 로 Referer 를 검사해요.
 *    타일이 403 으로 막히면 브이월드 마이페이지에서 서비스 URL 을
 *    https://toilet-near.apps.tossmini.com 으로 바꾸세요.
 *
 * 그래도 안 되면 아래 OSM 으로 한 줄만 바꾸면 돼요. 키도 도메인 등록도
 * 필요 없고, 앱인토스에서 실제로 도는 게 확인된 경로예요(그늘로).
 *   export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
 *   export const TILE_ATTRIBUTION = "© OpenStreetMap 기여자";
 *
 * 다만 OSM 공식 타일 서버는 이용 정책상 대량 트래픽을 허용하지 않아요.
 * 사용자가 늘면 타일 제공자를 따로 두거나 직접 호스팅해야 해요.
 */
export const TILE_URL =
  VWORLD_KEY === ""
    ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    : `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`;

export const TILE_ATTRIBUTION =
  VWORLD_KEY === "" ? "© OpenStreetMap 기여자" : "© 국토교통부 브이월드";
