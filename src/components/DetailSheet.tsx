import { formatDistance, walkMinutes } from "../lib/geo";
import { hoursLabel } from "../lib/hours";
import type { Toilet } from "../lib/toilets";
import { palette, stateStyle } from "../theme";

/**
 * 핀을 눌렀을 때 뜨는 상세.
 * TDS BottomSheet 대신 직접 그려요 — 지도 위에 겹치는 얕은 카드 하나뿐이라
 * 딤·포커스락이 있는 바텀시트를 쓰면 지도를 못 움직여요.
 */
export function DetailSheet({ t, onClose, onGo }: {
  t: Toilet;
  onClose: () => void;
  onGo: () => void;
}) {
  const s = stateStyle(t.state);
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 12,
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
            {hoursLabel(t.hours)} · {formatDistance(t.distance)} · 걸어서{" "}
            {walkMinutes(t.distance)}분
          </div>
          <div style={{ fontSize: 13, color: palette.sub, marginTop: 2 }}>
            {t.kind === 0 ? "공중화장실" : "개방화장실 (공공시설)"}
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

      <button
        onClick={onGo}
        style={{
          width: "100%",
          marginTop: 14,
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
    </div>
  );
}
