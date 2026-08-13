/**
 * 개방시간 판정.
 *
 * 공중화장실 데이터의 개방시간 칸은 자유 텍스트예요.
 * "(평일)09:00~18:00+(주말)상시닫힘" 같은 값이 실제로 들어 있어요.
 * 빌드 스크립트(scripts/build-toilets.mjs)가 아래 네 가지로만 줄여 놓고,
 * 앱은 줄여진 값만 봅니다.
 *
 *   "24"                    24시간
 *   "0900-1800"             요일 상관없이 같은 시간
 *   "0900-1800|1000-1700"   평일 | 주말·공휴일
 *   "0900-1800|"            평일만, 주말은 닫힘
 *   ""                      모름
 *
 * 자정을 넘기면 끝이 시작보다 작아요: "2200-0400".
 *
 * ⚠️ 공휴일은 주말과 같이 봅니다. 공휴일 달력이 없어서 정확히는 못 갈라요 —
 *    평일에 쉬는 공휴일을 "열림"으로 보여줄 수 있다는 뜻이에요.
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

/** 토·일. 공휴일은 못 갈라요. */
function isWeekendDay(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** 오늘 적용되는 구간 하나를 뽑아요. */
function spanOf(hours: string, now: Date): string {
  if (!hours.includes("|")) return hours;
  const [weekday, weekend] = hours.split("|");
  return isWeekendDay(now) ? weekend : weekday;
}

/**
 * 지금 열려 있나요?
 * @param hours 줄여진 개방시간 값
 * @param now   기준 시각. 안 주면 현재.
 */
export function openState(hours: string, now?: Date): OpenState {
  if (hours === "24") return "open";
  if (hours === "") return "unknown";

  const d = now ?? new Date();
  const span = spanOf(hours, d);
  // 주말 칸이 비어 있으면 그날은 닫는다는 뜻이에요. "모름"과 달라요.
  if (span === "") return "closed";

  const [rawStart, rawEnd] = span.split("-");
  const start = toMinutes(rawStart ?? "");
  const end = toMinutes(rawEnd ?? "");
  if (start == null || end == null) return "unknown";

  const nowMin = d.getHours() * 60 + d.getMinutes();

  // 22:00~04:00 처럼 자정을 넘기는 경우엔 두 구간의 합집합이에요.
  if (end <= start) return nowMin >= start || nowMin < end ? "open" : "closed";
  return nowMin >= start && nowMin < end ? "open" : "closed";
}

const fmt = (v: string) => `${v.slice(0, 2)}:${v.slice(2)}`;

/** 화면에 붙일 짧은 라벨 — 오늘 기준이에요. */
export function hoursLabel(hours: string, now?: Date): string {
  if (hours === "24") return "24시간";
  if (hours === "") return "시간 정보 없음";

  const d = now ?? new Date();
  const span = spanOf(hours, d);
  if (span === "") return isWeekendDay(d) ? "주말 휴무" : "휴무";

  const [s, e] = span.split("-");
  if (!/^\d{4}$/.test(s ?? "") || !/^\d{4}$/.test(e ?? "")) return "시간 정보 없음";
  return `${fmt(s)}~${fmt(e)}`;
}

/** 상세 화면용 — 평일과 주말이 다르면 둘 다 보여줘요. */
export function hoursDetail(hours: string): { day: string; span: string }[] {
  if (hours === "24") return [{ day: "매일", span: "24시간" }];
  if (hours === "") return [{ day: "", span: "시간 정보 없음" }];

  const label = (v: string) => {
    if (v === "") return "휴무";
    const [s, e] = v.split("-");
    if (!/^\d{4}$/.test(s ?? "") || !/^\d{4}$/.test(e ?? "")) return "정보 없음";
    return `${fmt(s)}~${fmt(e)}`;
  };

  if (!hours.includes("|")) return [{ day: "매일", span: label(hours) }];
  const [weekday, weekend] = hours.split("|");
  return [
    { day: "평일", span: label(weekday) },
    { day: "주말·공휴일", span: label(weekend) },
  ];
}

/* ------------------------------------------------------------------ */
/* 자체 점검 — `npm run check:hours`                                   */
/* 시간 판정이 틀리면 "열려 있다고 해서 갔는데 잠겨 있는" 최악이 나요. */
/* ------------------------------------------------------------------ */
export function demo(): void {
  const eq = (got: unknown, want: unknown, label: string) => {
    if (got !== want) throw new Error(`${label}: ${String(got)} !== ${String(want)}`);
  };
  // 2026-08-14 는 금요일, 08-15 는 토요일, 08-16 은 일요일.
  const at = (iso: string) => new Date(iso);
  eq(at("2026-08-14T10:00:00").getDay(), 5, "기준일이 금요일인지 확인");
  eq(at("2026-08-15T10:00:00").getDay(), 6, "토요일 확인");

  eq(openState("24", at("2026-08-14T03:00:00")), "open", "24시간은 새벽에도 열림");
  eq(openState("", at("2026-08-14T10:00:00")), "unknown", "빈 값은 모름");

  // 요일 구분 없는 값
  eq(openState("0900-1800", at("2026-08-14T08:59:00")), "closed", "9시 1분 전은 닫힘");
  eq(openState("0900-1800", at("2026-08-14T09:00:00")), "open", "9시 정각은 열림");
  eq(openState("0900-1800", at("2026-08-14T18:00:00")), "closed", "18시 정각은 닫힘");
  eq(openState("0900-1800", at("2026-08-16T10:00:00")), "open", "요일 구분 없으면 일요일도 열림");

  // 평일만 — 주말 칸이 비어 있음
  eq(openState("0900-1800|", at("2026-08-14T10:00:00")), "open", "평일 낮은 열림");
  eq(openState("0900-1800|", at("2026-08-15T10:00:00")), "closed", "토요일은 닫힘");
  eq(openState("0900-1800|", at("2026-08-16T10:00:00")), "closed", "일요일은 닫힘");
  eq(openState("0900-1800|", at("2026-08-14T20:00:00")), "closed", "평일 밤은 닫힘");

  // 평일과 주말 시간이 다른 경우
  eq(openState("0900-2000|0900-1800", at("2026-08-14T19:00:00")), "open", "평일 19시 열림");
  eq(openState("0900-2000|0900-1800", at("2026-08-15T19:00:00")), "closed", "주말 19시는 닫힘");
  eq(openState("0900-2000|0900-1800", at("2026-08-15T17:00:00")), "open", "주말 17시는 열림");

  // 자정 넘김
  eq(openState("2200-0400", at("2026-08-14T23:00:00")), "open", "23시 열림");
  eq(openState("2200-0400", at("2026-08-14T02:00:00")), "open", "새벽 2시 열림");
  eq(openState("2200-0400", at("2026-08-14T12:00:00")), "closed", "낮 12시 닫힘");

  // 06:00~24:00(자정까지)은 "0600-0000" 으로 들어와요.
  eq(openState("0600-0000", at("2026-08-14T23:59:00")), "open", "자정 직전 열림");
  eq(openState("0600-0000", at("2026-08-14T06:00:00")), "open", "6시 정각 열림");
  eq(openState("0600-0000", at("2026-08-14T05:59:00")), "closed", "6시 전은 닫힘");

  // 깨진 값은 "열림"이 아니라 "모름"
  eq(openState("9-18", at("2026-08-14T10:00:00")), "unknown", "형식 안 맞으면 모름");
  eq(openState("2500-2600", at("2026-08-14T10:00:00")), "unknown", "말도 안 되는 시각은 모름");

  eq(hoursLabel("0530-2230"), "05:30~22:30", "라벨");
  eq(hoursLabel("0900-1800|", at("2026-08-14T10:00:00")), "09:00~18:00", "평일 라벨");
  eq(hoursLabel("0900-1800|", at("2026-08-15T10:00:00")), "주말 휴무", "주말 라벨");
  eq(hoursLabel("24"), "24시간", "24시간 라벨");

  eq(hoursDetail("0900-1800|")[1].span, "휴무", "상세: 주말 휴무");
  eq(hoursDetail("0900-2000|0900-1800")[0].span, "09:00~20:00", "상세: 평일");
  eq(hoursDetail("0900-1800").length, 1, "요일 구분 없으면 한 줄");

  console.log("hours.ts OK");
}
