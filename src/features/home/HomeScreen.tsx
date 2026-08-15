import { Device } from "@apps-in-toss/web-framework";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ImageBannerAd } from "../../components/BannerAd";
import { CoachMarks } from "../../components/CoachMarks";
import { DetailSheet } from "../../components/DetailSheet";
import { MapView } from "../../components/MapView";
import { NoToilet } from "../../components/NoToilet";
import { Card } from "../../components/ScreenLayout";
import { EVENT, track, trackScreen } from "../../lib/analytics";
import { formatDistance, walkMinutes, type LatLng } from "../../lib/geo";
import { hoursLabel } from "../../lib/hours";
import {
  directionsUrl,
  findNearby,
  RADIUS_OPTIONS,
  withinRadius,
  type Radius,
  type Toilet,
} from "../../lib/toilets";
import { palette, stateStyle } from "../../theme";

type Phase =
  | { k: "locating" }
  | { k: "ready"; me: LatLng; all: Toilet[] }
  | { k: "denied" }
  | { k: "error"; message: string };

type Tab = "map" | "list";

/** 반경 칩 줄(56) + 다시 찾기 줄(44). 지도·목록 패널이 이 아래부터 시작해요. */
const HEADER_HEIGHT = 100;

/**
 * 지금 내 위치.
 *
 * 토스 앱 안에서는 Device.getLocation 을 씁니다. accuracy 를 최고로 올리면
 * 실내에서 GPS 를 붙잡느라 몇 초씩 걸려서, 수십 미터면 충분한 이 앱은
 * Balanced(3) 로 받아요.
 *
 * 웹 브라우저로 열면 토스 브릿지가 없어요. 그때는 표준 geolocation 으로
 * 넘어갑니다 — 다만 권한을 거부당한 경우에는 원래 오류를 그대로 올려야
 * 위쪽에서 "권한 거부" 화면을 띄울 수 있어요.
 */
async function currentPosition(): Promise<LatLng> {
  try {
    const loc = await Device.getLocation({ accuracy: 3 });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch (bridgeError) {
    if (navigator.geolocation == null) throw bridgeError;
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => reject(bridgeError),
        { enableHighAccuracy: false, timeout: 8000 },
      );
    });
  }
}

export function HomeScreen() {
  const [phase, setPhase] = useState<Phase>({ k: "locating" });
  const [tab, setTab] = useState<Tab>("map");
  const [radius, setRadius] = useState<Radius>(1000);
  const [picked, setPicked] = useState<Toilet | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // 코치마크가 가리킬 요소들.
  const radiusRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const listTabRef = useRef<HTMLButtonElement>(null);

  const locate = useCallback(async () => {
    setPhase({ k: "locating" });
    try {
      const me = await currentPosition();
      track(EVENT.locationGranted);
      const all = await findNearby(me);
      track(EVENT.nearbyFound, { count: all.length });
      setPhase({ k: "ready", me, all });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name.includes("Permission")) {
        track(EVENT.locationDenied);
        setPhase({ k: "denied" });
        return;
      }
      setPhase({ k: "error", message: "위치를 확인하지 못했어요. 다시 눌러주세요." });
    }
  }, []);

  // 급한 사람에게 버튼을 한 번 더 누르게 하지 않아요. 열자마자 찾습니다.
  useEffect(() => {
    trackScreen("home");
    void locate();
  }, [locate]);

  /**
   * "다시 찾기". 이동 중에 위치가 바뀌었을 때 앱을 껐다 켜지 않아도
   * 되게 해요. 반경·탭 선택은 건드리지 않고, 위치와 목록만 새로 받습니다.
   * 실패해도 화면에 떠 있던 목록은 그대로 두고 실패만 알려요.
   */
  const refresh = useCallback(() => {
    if (refreshing) return; // 연타 방지
    setRefreshing(true);
    setRefreshError(null);
    void (async () => {
      try {
        const me = await currentPosition();
        const all = await findNearby(me); // openState 도 여기서 새로 계산돼요.
        setPhase({ k: "ready", me, all });
      } catch {
        setRefreshError("위치를 다시 잡지 못했어요.");
      } finally {
        setRefreshing(false);
      }
    })();
  }, [refreshing]);

  const list = useMemo(
    () => (phase.k === "ready" ? withinRadius(phase.all, radius) : []),
    [phase, radius],
  );

  // 반경을 좁혔을 때 밖으로 나간 곳이 상세로 떠 있으면 안 돼요.
  useEffect(() => {
    if (picked != null && !list.includes(picked)) setPicked(null);
  }, [list, picked]);

  const openDirections = (t: Toilet) => {
    track(EVENT.directionsOpened, { name: t.name, distance: Math.round(t.distance) });
    void Device.openURL(directionsUrl(t));
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: palette.bg, position: "relative" }}>
      {/* ---------------------------------------------------------- 본문 */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {phase.k === "locating" && <Center><Notice text="주변을 찾고 있어요…" /></Center>}

        {phase.k === "denied" && (
          <Center>
            <Notice
              text="위치를 알아야 가까운 곳을 찾을 수 있어요."
              action={{ label: "위치 허용하고 찾기", onClick: () => void locate() }}
            />
          </Center>
        )}

        {phase.k === "error" && (
          <Center>
            <Notice text={phase.message} action={{ label: "다시 찾기", onClick: () => void locate() }} />
          </Center>
        )}

        {phase.k === "ready" && (
          <>
            <TopBar
              radius={radius}
              onChangeRadius={setRadius}
              count={list.length}
              onRefresh={refresh}
              refreshing={refreshing}
              refreshError={refreshError}
              radiusRef={radiusRef}
              refreshRef={refreshRef}
            />

            {tab === "map" ? (
              <div
                style={{ position: "absolute", inset: `${HEADER_HEIGHT}px 0 0`, overflow: "hidden" }}
              >
                <MapView me={phase.me} toilets={list} radius={radius} onSelect={setPicked} />
                {list.length === 0 && (
                  // 지도가 아예 안 보이면 안 되니 반투명하게만 덮어요.
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(255,255,255,0.88)",
                      zIndex: 1000,
                      padding: 24,
                    }}
                  >
                    <EmptyState />
                  </div>
                )}
                {picked != null && (
                  <DetailSheet
                    t={picked}
                    onClose={() => setPicked(null)}
                    onGo={() => openDirections(picked)}
                  />
                )}
              </div>
            ) : (
              <ListPane list={list} onGo={openDirections} />
            )}

            {/* 위치를 못 잡았거나 오류 화면일 땐 안 떠요 — 지도가 준비된 뒤에만. */}
            <CoachMarks
              storageKey="toilet-near:coach:v1"
              steps={[
                { ref: radiusRef, title: "반경을 고르세요", body: "얼마나 가까운 곳까지 찾을지 정할 수 있어요." },
                { ref: refreshRef, title: "걸어가다 위치가 바뀌었나요?", body: "이 버튼을 누르면 지금 위치로 다시 찾아요." },
                // 지도 전체를 짚는 단계는 뺐어요. 구멍이 화면을 다 덮으면 어두운
                // 덮개가 사라져서 흰 글씨가 지도 위에 묻혀 안 읽힙니다.
                { ref: listTabRef, title: "목록으로도 볼 수 있어요", body: "가까운 순으로 쭉 보고 싶으면 여기를 눌러요." },
              ]}
            />
          </>
        )}
      </div>

      {/* --------------------------------------------------- 하단 탭 (플로팅)
          바닥에 꽉 채우면 토스 앱 자체 하단 탭과 모양이 겹쳐서, 사용자가 지금
          어디에 있는지 헷갈려요. 앱인토스 UX 가이드가 캡슐형 플로팅을 요구합니다. */}
      <nav
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          // 배너 자리가 없을 때 홈 인디케이터에 걸리지 않게 띄워요.
          bottom: "calc(12px + env(safe-area-inset-bottom))",
          display: "flex",
          justifyContent: "center",
          // 캡슐 밖은 손가락이 그대로 지도로 통과해야 해요.
          pointerEvents: "none",
          // 상세 카드(1000)보다 위에 있어야 탭이 안 가려져요.
          zIndex: 1100,
        }}
      >
        <div
          style={{
            pointerEvents: "auto",
            display: "inline-flex",
            background: palette.white,
            borderRadius: 999,
            padding: 6,
            boxShadow: "0 6px 20px rgba(27,29,33,0.18)",
          }}
        >
          <TabButton active={tab === "map"} onClick={() => setTab("map")} label="지도" icon="🗺️" />
          <TabButton active={tab === "list"} onClick={() => setTab("list")} label="목록" icon="📋" elRef={listTabRef} />
        </div>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ 조각 */

function TopBar({
  radius,
  onChangeRadius,
  count,
  onRefresh,
  refreshing,
  refreshError,
  radiusRef,
  refreshRef,
}: {
  radius: Radius;
  onChangeRadius: (r: Radius) => void;
  count: number;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError: string | null;
  radiusRef: React.RefObject<HTMLDivElement>;
  refreshRef: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        background: palette.bg,
        zIndex: 2,
      }}
    >
      <div
        ref={radiusRef}
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
        }}
      >
        {RADIUS_OPTIONS.map((r) => (
          <button
            key={r}
            onClick={() => onChangeRadius(r)}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 700,
              color: radius === r ? palette.white : palette.sub,
              background: radius === r ? palette.primary : "rgba(27,29,33,0.06)",
            }}
          >
            {r < 1000 ? `${r}m` : `${r / 1000}km`}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 13, color: palette.sub }}>{count}곳</span>
      </div>

      {/* 지도·목록 양쪽에 공유되는 줄이라 여기 두면 탭을 넘나들며 눌러요. */}
      <div style={{ height: 44, display: "flex", alignItems: "center", gap: 8, padding: "0 16px 10px" }}>
        <button
          ref={refreshRef}
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            border: "none",
            borderRadius: 10,
            padding: "8px 14px",
            fontSize: 14,
            fontWeight: 700,
            color: refreshing ? palette.sub : palette.primary,
            background: "rgba(47,111,237,0.10)",
          }}
        >
          {refreshing ? "찾는 중…" : "다시 찾기"}
        </button>
        {refreshError != null && (
          <span style={{ fontSize: 13, color: palette.unknown }}>{refreshError}</span>
        )}
      </div>
    </div>
  );
}

function ListPane({ list, onGo }: { list: Toilet[]; onGo: (t: Toilet) => void }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: `${HEADER_HEIGHT}px 0 0`,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "0 16px calc(96px + env(safe-area-inset-bottom))",
      }}
    >
      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((t, i) => (
            <ToiletRow key={`${t.lat},${t.lng},${i}`} t={t} onGo={() => onGo(t)} />
          ))}
        </div>
      )}

      {/* 이미지형 배너 — 목록을 끝까지 내린 사람에게만 보여요. */}
      <div style={{ marginTop: 24 }}>
        <ImageBannerAd />
      </div>

      <p style={{ fontSize: 12, color: palette.sub, marginTop: 16, lineHeight: 1.6 }}>
        행정안전부 전국공중화장실·공공시설개방정보 표준데이터 기준이에요.
        현장 사정으로 닫혀 있을 수 있어요.
      </p>
    </div>
  );
}

function ToiletRow({ t, onGo }: { t: Toilet; onGo: () => void }) {
  const s = stateStyle(t.state);
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            {/* 색만으로 구분하지 않아요 — 햇빛 아래에선 파랑/회색이 잘 안 갈려요. */}
            <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.label}</span>
            <span style={{ fontSize: 13, color: palette.sub }}>· {hoursLabel(t.hours)}</span>
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: palette.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {t.name}
          </div>
          <div style={{ fontSize: 14, color: palette.sub, marginTop: 2 }}>
            {formatDistance(t.distance)} · 걸어서 {walkMinutes(t.distance)}분
          </div>
        </div>

        <button
          onClick={onGo}
          style={{
            flexShrink: 0,
            border: "none",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 15,
            fontWeight: 700,
            color: palette.white,
            background: palette.primary,
          }}
        >
          길찾기
        </button>
      </div>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
  elRef,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
  elRef?: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <button
      ref={elRef}
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        borderRadius: 999,
        padding: "8px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1.1, opacity: active ? 1 : 0.4 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: active ? palette.ink : palette.sub }}>
        {label}
      </span>
    </button>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 20 }}>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <Card style={{ textAlign: "center", padding: 24 }}>
      <NoToilet />
      <p style={{ fontSize: 17, fontWeight: 700, color: palette.ink, margin: "12px 0 4px" }}>
        늦었습니다
      </p>
      <p style={{ fontSize: 14, color: palette.sub, margin: 0 }}>
        이 반경에는 화장실이 없어요. 반경을 넓혀보세요.
      </p>
    </Card>
  );
}

function Notice({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <Card style={{ textAlign: "center", padding: 24 }}>
      <p style={{ fontSize: 15, color: palette.sub, margin: 0, lineHeight: 1.6 }}>{text}</p>
      {action != null && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 16,
            border: "none",
            borderRadius: 12,
            padding: "14px 20px",
            fontSize: 16,
            fontWeight: 700,
            color: palette.white,
            background: palette.primary,
          }}
        >
          {action.label}
        </button>
      )}
    </Card>
  );
}
