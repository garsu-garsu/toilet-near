import { formatDistance, walkMinutes } from "../lib/geo";
import { hoursDetail } from "../lib/hours";
import { KIND_LABEL, type Toilet } from "../lib/toilets";
import { palette, stateStyle } from "../theme";

/**
 * 핀을 눌렀을 때 뜨는 상세.
 * TDS BottomSheet 대신 직접 그려요 — 지도 위에 겹치는 얕은 카드 하나뿐이라
 * 딤·포커스락이 있는 바텀시트를 쓰면 지도를 못 움직여요.
 */
export function DetailSheet({ t, onClose, onGo, onShare }: {
  t: Toilet;
  onClose: () => void;
  onGo: () => void;
  onShare: () => void;
}) {
  const s = stateStyle(t.state);
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        // 플로팅 탭바(약 70px)에 길찾기 버튼이 가리지 않게 띄워요.
        bottom: "calc(92px + env(safe-area-inset-bottom))",
        // Leaflet 이 타일·마커를 400~700 에 깔아요. z-index 를 안 주면 이 카드가
        // 지도 밑으로 들어가서, 핀을 눌러도 아무 일도 안 일어난 것처럼 보입니다.
        zIndex: 1000,
        background: palette.card,
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 6px 24px rgba(27,29,33,0.22)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.label}</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: palette.ink }}>{t.name}</div>
          <div style={{ fontSize: 14, color: palette.sub, marginTop: 4 }}>
            {formatDistance(t.distance)} · 걸어서 {walkMinutes(t.distance)}분 ·{" "}
            {KIND_LABEL[t.kind]}
          </div>

          {/* 평일과 주말이 다르면 둘 다 보여줘요. 오늘만 보여주면
              "내일 가도 되나" 를 알 수 없어요. */}
          <div style={{ marginTop: 8 }}>
            {hoursDetail(t.hours).map(({ day, span }) => (
              <div key={day} style={{ display: "flex", fontSize: 14, padding: "2px 0" }}>
                {day !== "" && (
                  <span style={{ width: 76, color: palette.sub }}>{day}</span>
                )}
                <span style={{ color: span === "휴무" ? palette.sub : palette.ink }}>
                  {span}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="닫기"
          style={{
            border: "none",
            background: "transparent",
            fontSize: 20,
            color: palette.sub,
            padding: 4,
          }}
        >
          ✕
        </button>
      </div>

      {/* 길찾기가 주인공이라 넓게 두고, 공유는 옆에 작게 둬요. */}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          onClick={onGo}
          style={{
            flex: 1,
            border: "none",
            borderRadius: 12,
            padding: "14px 0",
            fontSize: 16,
            fontWeight: 700,
            color: palette.white,
            background: palette.primary,
          }}
        >
          길찾기
        </button>
        <button
          onClick={onShare}
          aria-label="이 화장실 공유"
          style={{
            flexShrink: 0,
            border: `1px solid ${palette.line}`,
            borderRadius: 12,
            padding: "14px 18px",
            fontSize: 16,
            fontWeight: 700,
            color: palette.primary,
            background: palette.card,
          }}
        >
          공유
        </button>
      </div>
    </div>
  );
}
