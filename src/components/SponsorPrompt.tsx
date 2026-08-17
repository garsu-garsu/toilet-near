/**
 * 길찾기를 누르고 앱으로 돌아왔을 때만 뜨는 조용한 한 줄이에요.
 * 진입 직후에 뜨는 오버레이가 아니에요 — 이 앱은 그 사유로 이미 두 번
 * 반려됐어요(`CoachMarks.tsx` 참고). 화면을 가로막지 않고, 손가락은 그대로
 * 아래 지도로 통과해요.
 */
export function SponsorPrompt({
  onOpen,
  onDismiss,
}: {
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: "calc(84px + env(safe-area-inset-bottom))",
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(27,29,33,0.82)",
        borderRadius: 12,
        padding: "10px 8px 10px 14px",
        boxShadow: "0 4px 16px rgba(27,29,33,0.18)",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1,
          textAlign: "left",
          border: "none",
          background: "transparent",
          color: "#FFFFFF",
          fontSize: 13,
          fontWeight: 600,
          padding: 0,
        }}
      >
        도움이 되셨다면, 광고 없이 보기로 후원할 수 있어요
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="닫기"
        style={{
          border: "none",
          background: "transparent",
          color: "rgba(255,255,255,0.7)",
          fontSize: 16,
          padding: 6,
        }}
      >
        ✕
      </button>
    </div>
  );
}
