import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

import { TILE_ATTRIBUTION, TILE_URL } from "../lib/env";
import type { LatLng } from "../lib/geo";
import type { Toilet } from "../lib/toilets";
import { palette, stateStyle } from "../theme";

interface Props {
  me: LatLng;
  toilets: Toilet[];
  /** 반경(m). 지도에 원으로 그리고, 그 원이 딱 들어오게 배율을 맞춰요. */
  radius: number;
  onSelect: (t: Toilet) => void;
}

/**
 * 지도.
 *
 * 이 앱에서 지도가 하는 일은 핀 찍기와 반경 원 그리기가 전부예요.
 * 그래서 지도사 SDK 대신 Leaflet(약 40KB) + 타일 주소 한 줄로 끝냅니다 —
 * 인증키도 도메인 등록도 필요 없고, 타일 주소만 바꾸면 지도를 통째로 갈 수 있어요.
 */
export function MapView({ me, toilets, radius, onSelect }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const [tileFailed, setTileFailed] = useState(false);

  // 클릭 핸들러가 최신 목록을 보게 해요. 마커를 다시 만들 때마다
  // 콜백을 새로 묶지 않으려고 ref 로 넘깁니다.
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  // 지도 만들기 — 한 번만.
  useEffect(() => {
    if (boxRef.current == null || mapRef.current != null) return;

    const map = L.map(boxRef.current, {
      center: [me.lat, me.lng],
      zoom: 15,
      zoomControl: false,
      // 급할 때 쓰는 화면이라 회전·기울임 같은 건 없는 게 나아요.
      attributionControl: true,
    });
    mapRef.current = map;

    const tiles = L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: TILE_ATTRIBUTION,
    });
    // 타일이 막히면(브이월드 도메인 검사 등) 회색 화면만 남아요.
    // 그 상태를 사용자에게 알려주고 목록 탭으로 보냅니다.
    tiles.on("tileerror", () => setTileFailed(true));
    tiles.addTo(map);

    // 내 위치는 작은 원으로. 마커로 찍으면 화장실 핀과 헷갈려요.
    L.circleMarker([me.lat, me.lng], {
      radius: 7,
      color: "#fff",
      weight: 3,
      fillColor: palette.primary,
      fillOpacity: 1,
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [me.lat, me.lng]);

  // 반경 원 + 배율
  useEffect(() => {
    const map = mapRef.current;
    if (map == null) return;

    circleRef.current?.remove();
    const circle = L.circle([me.lat, me.lng], {
      radius,
      color: palette.primary,
      weight: 2,
      opacity: 0.5,
      dashArray: "6 6",
      fillColor: palette.primary,
      fillOpacity: 0.06,
    }).addTo(map);
    circleRef.current = circle;

    // 반경을 바꾸면 배율도 따라와야 자연스러워요.
    map.fitBounds(circle.getBounds(), { padding: [24, 24] });
  }, [radius, me.lat, me.lng]);

  // 목록이 바뀌면 핀을 갈아끼워요.
  useEffect(() => {
    const layer = markersRef.current;
    if (layer == null) return;
    layer.clearLayers();

    for (const t of toilets) {
      const { color } = stateStyle(t.state);
      L.marker([t.lat, t.lng], { icon: pinIcon(color) })
        .on("click", () => selectRef.current(t))
        .addTo(layer);
    }
  }, [toilets]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={boxRef} style={{ width: "100%", height: "100%", background: "#E8ECF1" }} />

      {tileFailed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(245,247,250,0.94)",
            padding: 24,
          }}
        >
          <p style={{ fontSize: 15, color: palette.sub, textAlign: "center", lineHeight: 1.7, margin: 0 }}>
            지도를 불러오지 못했어요.
            <br />
            아래 <b>목록</b> 탭에서 가까운 순으로 볼 수 있어요.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 핀. Leaflet 기본 마커는 이미지 파일을 따로 물어서(번들 경로가 깨지기 쉬워요)
 * div 아이콘으로 직접 그립니다.
 */
function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html:
      `<div style="width:24px;height:24px;border-radius:50%;background:${color};` +
      `border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
