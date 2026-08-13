export const AD_GROUP_ID_BANNER = import.meta.env.VITE_AD_GROUP_ID_BANNER ?? "";
export const AD_GROUP_ID_BANNER_IMAGE =
  import.meta.env.VITE_AD_GROUP_ID_BANNER_IMAGE ?? "";

/**
 * 배경지도 타일 주소.
 *
 * OpenStreetMap 을 씁니다. 인증키도 도메인 등록도 필요 없고,
 * 앱인토스에서 실제로 도는 게 확인된 경로예요(그늘로가 이걸 씁니다).
 *
 * 브이월드 타일도 됩니다(키 하나로 지오코더까지 해결). 다만 화장실 좌표를
 * 찍는 배치와 호출 한도를 나눠 쓰게 되는데, 배치가 도는 동안 지도가 502 로
 * 통째로 막히는 걸 실제로 겪었어요. 한도는 지오코딩에만 쓰는 게 낫습니다.
 * 바꾸려면 아래 두 줄만 갈면 돼요:
 *   `https://api.vworld.kr/req/wmts/1.0.0/${키}/Base/{z}/{y}/{x}.png`
 *   "© 국토교통부 브이월드"
 *
 * ⚠️ OSM 공식 타일 서버는 이용 정책상 대량 트래픽을 허용하지 않아요.
 *    사용자가 늘면 타일 제공자를 따로 두거나 직접 호스팅해야 합니다.
 *    ponytail: 출시하고 실제로 트래픽이 붙으면 그때 옮기세요.
 */
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const TILE_ATTRIBUTION = "© OpenStreetMap 기여자";
