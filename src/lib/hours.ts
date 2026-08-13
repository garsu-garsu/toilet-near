/**
 * 개방시간 판정.
 *
 * 공중화장실 표준데이터의 개방시간 칸은 자유 텍스트예요.
 * "24시간", "상시개방", "09:00~18:00", "하절기 05:00-22:00", 빈칸이 뒤섞여 있어요.
 * 빌드 스크립트(scripts/build-toilets.mjs)가 아래 세 가지로만 줄여 놓고,
 * 앱은 줄여진 값만 봅니다.
 *
 *   "24"          24시간
 *   "0900-1800"   시분 범위 (자정을 넘기면 끝이 시작보다 작아요: "2200-0400")
 *   ""            모름
 */
export type OpenState = "open" | "closed" | "unknown";

/** "HHMM" → 분. 형식이 아니면 null. */
function toMinutes(hhmm: string): number | null {
  if (!/^\d{4}$/.test(hhmm)) return null;
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2));
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * 지금 열려 있나요?
 * @param hours 줄여진 개방시간 값
 * @param nowMin 자정부터 지난 분. 안 주면 현재 시각.
 */
export function openState(hours: string, nowMin?: number): OpenState {
  if (hours === "24") return "open";
  if (hours === "") return "unknown";

  const [rawStart, rawEnd] = hours.split("-");
  const start = toMinutes(rawStart ?? "");
  const end = toMinutes(rawEnd ?? "");
  if (start == null || end == null) return "unknown";

  const now =
    nowMin ?? (() => {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    })();

  // 22:00~04:00 처럼 자정을 넘기는 경우엔 두 구간의 합집합이에요.
  if (end <= start) return now >= start || now < end ? "open" : "closed";
  return now >= start && now < end ? "open" : "closed";
}

/** 화면에 붙일 짧은 라벨. */
export function hoursLabel(hours: string): string {
  if (hours === "24") return "24시간";
  if (hours === "") return "시간 정보 없음";
  const [s, e] = hours.split("-");
  const fmt = (v: string) => `${v.slice(0, 2)}:${v.slice(2)}`;
  return `${fmt(s)}~${fmt(e)}`;
}

/* ------------------------------------------------------------------ */
/* 자체 점검 — `npm run check:hours`                                   */
/* 시간 판정이 틀리면 "열려 있다고 해서 갔는데 잠겨 있는" 최악이 나요. */
/* ------------------------------------------------------------------ */
export function demo(): void {
  const eq = (got: unknown, want: unknown, label: string) => {
    if (got !== want) throw new Error(`${label}: ${String(got)} !== ${String(want)}`);
  };

  eq(openState("24", 0), "open", "24시간은 새벽에도 열림");
  eq(openState("", 600), "unknown", "빈 값은 모름");
  eq(openState("0900-1800", 8 * 60 + 59), "closed", "9시 1분 전은 닫힘");
  eq(openState("0900-1800", 9 * 60), "open", "9시 정각은 열림");
  eq(openState("0900-1800", 18 * 60), "closed", "18시 정각은 닫힘(끝은 제외)");
  eq(openState("0900-1800", 17 * 60 + 59), "open", "17:59는 열림");

  // 자정을 넘기는 구간
  eq(openState("2200-0400", 23 * 60), "open", "23시는 열림");
  eq(openState("2200-0400", 2 * 60), "open", "새벽 2시는 열림");
  eq(openState("2200-0400", 12 * 60), "closed", "낮 12시는 닫힘");
  eq(openState("2200-0400", 4 * 60), "closed", "4시 정각은 닫힘");

  // 깨진 값은 "열림"이 아니라 "모름"으로 떨어져야 해요.
  eq(openState("9-18", 600), "unknown", "형식 안 맞으면 모름");
  eq(openState("2500-2600", 600), "unknown", "말도 안 되는 시각은 모름");

  eq(hoursLabel("0530-2230"), "05:30~22:30", "라벨");
  console.log("hours.ts OK");
}
