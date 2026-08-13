import { distanceM, nearbyCells, type LatLng } from "./geo";
import { openState, type OpenState } from "./hours";

/**
 * 격자 파일 한 줄. 6만 건을 담아야 해서 객체 대신 배열로 눌러 놨어요.
 * [위도, 경도, 이름, 개방시간, 종류]
 * 종류 0 = 공중화장실, 1 = 개방화장실(관공서·공공시설)
 */
export type Row = [number, number, string, string, 0 | 1];

export interface Toilet {
  lat: number;
  lng: number;
  name: string;
  hours: string;
  kind: 0 | 1;
  distance: number;
  state: OpenState;
}

/**
 * 격자 파일은 `public/data/cells/{y}_{x}.json` 에 있어요.
 * 배포한 번들 안에 들어 있어서 네트워크가 끊겨도 캐시가 살아 있으면 열려요.
 */
const CELL_URL = (key: string) => `/data/cells/${key}.json`;

/** 같은 칸을 다시 읽지 않아요. 지도 움직일 때마다 같은 파일을 부르면 낭비예요. */
const cache = new Map<string, Row[]>();

async function loadCell(key: string): Promise<Row[]> {
  const hit = cache.get(key);
  if (hit != null) return hit;
  try {
    const res = await fetch(CELL_URL(key));
    // 바다·산처럼 화장실이 하나도 없는 칸은 파일 자체가 없어요. 404 는 정상이에요.
    const rows = res.ok ? ((await res.json()) as Row[]) : [];
    cache.set(key, rows);
    return rows;
  } catch {
    cache.set(key, []);
    return [];
  }
}

/** 반경 선택지(m). 급할 때 고를 거라 세 개면 충분해요. */
export const RADIUS_OPTIONS = [500, 1000, 3000] as const;
export type Radius = (typeof RADIUS_OPTIONS)[number];

/**
 * 내 주변 화장실 전부를 가까운 순으로. 반경 필터는 화면에서 걸어요 —
 * 반경을 바꿀 때마다 파일을 다시 읽지 않으려고 여기선 자르지 않습니다.
 */
export async function findNearby(me: LatLng): Promise<Toilet[]> {
  const cells = await Promise.all(nearbyCells(me.lat, me.lng).map(loadCell));

  return cells
    .flat()
    .map(([lat, lng, name, hours, kind]) => ({
      lat,
      lng,
      name,
      hours,
      kind,
      distance: distanceM(me, { lat, lng }),
      state: openState(hours),
    }))
    .sort((a, b) => a.distance - b.distance);
}

/**
 * 반경 안에서, 지금 열려 있는 곳을 위로.
 * 닫힌 곳을 거리만 보고 맨 위에 올리면 헛걸음해요.
 */
export function withinRadius(list: Toilet[], radius: number): Toilet[] {
  const rank = (t: Toilet) => (t.state === "open" ? 0 : t.state === "unknown" ? 1 : 2);
  return list
    .filter((t) => t.distance <= radius)
    .sort((a, b) => rank(a) - rank(b) || a.distance - b.distance);
}

/** 카카오맵 길찾기. 앱이 깔려 있으면 앱으로, 아니면 웹으로 열려요. */
export function directionsUrl(t: Toilet): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(t.name)},${t.lat},${t.lng}`;
}
