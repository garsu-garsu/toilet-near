// 급할 때 보는 화면이라 대비를 세게 잡았어요.
// 열림=파랑(안심), 닫힘=회색, 모름=주황.
export const palette = {
  primary: "#2F6FED",
  open: "#1B72C4",
  closed: "#8A9099",
  unknown: "#C97A16",
  ink: "#1B1D21",
  sub: "#6B7280",
  line: "rgba(47,111,237,0.14)",
  card: "#FFFFFF",
  bg: "#F5F7FA",
  white: "#FFFFFF",
};

/** 색만으로 구분하지 않아요 — 햇빛 아래에서는 파랑/회색이 잘 안 갈려요. */
export function stateStyle(state: "open" | "closed" | "unknown"): {
  color: string;
  label: string;
} {
  if (state === "open") return { color: palette.open, label: "지금 열림" };
  if (state === "closed") return { color: palette.closed, label: "지금 닫힘" };
  return { color: palette.unknown, label: "시간 정보 없음" };
}
