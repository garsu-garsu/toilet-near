/**
 * 후원(광고 없이 보기) 권한 — 로컬 저장 + 판정.
 *
 * 순수 계산(compute/apply)과 저장(load/save)을 분리했어요. 계산 로직은
 * localStorage 없이도 테스트할 수 있어야 만료 버그를 `npm run check:sponsor`
 * 로 바로 잡아낼 수 있어요.
 */

const KEY = "toilet-near:sponsor:v1";
const DAY_MS = 24 * 60 * 60 * 1000;
/** 지급 처리한 orderId를 이만큼만 기억해요. 무한히 쌓아둘 필요는 없어요. */
const GRANTED_IDS_LIMIT = 100;

export interface SponsorTier {
  sku: string;
  /** null이면 평생. 그 외는 구매 시점부터의 일수예요. */
  days: number | null;
}

/**
 * 콘솔에 등록된 후원 상품 8종. `_store/toilet-near-iap.md` 의 productId(=sku) 그대로예요.
 * 가격은 여기 넣지 않아요 — `IAP.getProductItemList()` 응답의 값을 그대로 써서,
 * 콘솔에서 가격이 바뀌어도 앱이 따라가게 해요.
 */
export const SPONSOR_TIERS: SponsorTier[] = [
  { sku: "ait.0000064308.600c0ca4.54d5d3432b.6885497517", days: 1 },
  { sku: "ait.0000064308.48204fa8.d389db502d.6885507495", days: 3 },
  { sku: "ait.0000064308.f1485915.030bb959b2.6885516182", days: 7 },
  { sku: "ait.0000064308.a2d3ff08.967c9bd7ba.6885525114", days: 30 },
  { sku: "ait.0000064308.58da4a88.4fdca2a666.6885533826", days: 90 },
  { sku: "ait.0000064308.2807b039.c52847fe56.6885542045", days: 180 },
  { sku: "ait.0000064308.52e55e84.c744a962a7.6885550607", days: 365 },
  { sku: "ait.0000064308.1e229a8f.7b9c620bc2.6885558869", days: null },
];

export function tierBySku(sku: string): SponsorTier | undefined {
  return SPONSOR_TIERS.find((t) => t.sku === sku);
}

export interface SponsorState {
  lifetime: boolean;
  /** ms epoch. lifetime이 아닐 때만 의미 있어요. */
  expiresAt: number | null;
  grantedOrderIds: string[];
}

const EMPTY_STATE: SponsorState = { lifetime: false, expiresAt: null, grantedOrderIds: [] };

/* ------------------------------------------------------------------ */
/* 순수 계산 — localStorage 없이 테스트돼요.                            */
/* ------------------------------------------------------------------ */

export function computeAdFree(state: SponsorState, now: number): boolean {
  return state.lifetime || (state.expiresAt != null && state.expiresAt > now);
}

/**
 * 실제 결제(라이브 구매·미지급 주문 재지급) 경로 전용. 같은 orderId는 한 번만
 * 반영해요 — `completeProductGrant` 확인이 실패해 같은 주문이 다음 실행에서
 * 다시 미지급으로 돌아와도, 기간이 중복으로 늘어나지 않게 하기 위해서예요.
 */
export function applyGrant(
  state: SponsorState,
  tier: SponsorTier,
  orderId: string,
  now: number,
): SponsorState {
  if (state.grantedOrderIds.includes(orderId)) return state;
  const grantedOrderIds = [...state.grantedOrderIds, orderId].slice(-GRANTED_IDS_LIMIT);

  if (tier.days == null) {
    return { ...state, lifetime: true, grantedOrderIds };
  }
  const base = Math.max(now, state.expiresAt ?? 0);
  return { ...state, expiresAt: base + tier.days * DAY_MS, grantedOrderIds };
}

export interface RestoreOrder {
  sku: string;
  status: "COMPLETED" | "REFUNDED";
  /** 주문 시각(ISO 등 Date.parse 가능한 문자열). */
  date: string;
}

/**
 * 기기 변경 복원(`IAP.getCompletedOrRefundedOrders`) 전용. 절대 만료시각을
 * 다시 계산하는 방식이라 몇 번을 다시 돌려도(orderId 중복 방지 없이도) 안전해요.
 *
 * - 평생권: 이력 중 날짜가 가장 늦은 주문의 상태를 따라요. COMPLETED면 부여, REFUNDED면 회수.
 * - 기간권(소모품): COMPLETED 주문마다 [결제시각 + 기간]을 후보로 계산하고, 그 중 가장 늦은
 *   값이 로컬 만료시각보다 늦을 때만 반영해요. 지난 결제로 계산한 만료시각은 이미 과거라
 *   자연히 로컬 값을 넘지 못하므로, 다 써버린 기간권이 되살아나지 않아요.
 * - 시각을 못 읽으면(파싱 실패) 그 주문은 건너뛰고 로컬 값을 그대로 둬요.
 */
export function applyRestore(state: SponsorState, orders: RestoreOrder[]): SponsorState {
  let expiresAt = state.expiresAt;
  let latestLifetime: { date: number; completed: boolean } | null = null;

  for (const order of orders) {
    const tier = tierBySku(order.sku);
    if (tier == null) continue;
    const purchasedAt = Date.parse(order.date);
    if (!Number.isFinite(purchasedAt)) continue;

    if (tier.days == null) {
      if (latestLifetime == null || purchasedAt > latestLifetime.date) {
        latestLifetime = { date: purchasedAt, completed: order.status === "COMPLETED" };
      }
      continue;
    }

    if (order.status !== "COMPLETED") continue;
    const candidate = purchasedAt + tier.days * DAY_MS;
    if (expiresAt == null || candidate > expiresAt) expiresAt = candidate;
  }

  const lifetime = latestLifetime != null ? latestLifetime.completed : state.lifetime;
  return { ...state, lifetime, expiresAt };
}

/* ------------------------------------------------------------------ */
/* 저장 — localStorage IO. 막혀 있어도(시크릿 모드 등) 앱은 죽지 않아요.  */
/* ------------------------------------------------------------------ */

function load(): SponsorState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<SponsorState>;
    return {
      lifetime: parsed.lifetime === true,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : null,
      grantedOrderIds: Array.isArray(parsed.grantedOrderIds) ? parsed.grantedOrderIds : [],
    };
  } catch {
    return EMPTY_STATE;
  }
}

function save(state: SponsorState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* localStorage가 막혀 있으면 이번 세션만 후원이 반영 안 돼요. */
  }
}

export function hasAdFreeAccess(now: number = Date.now()): boolean {
  return computeAdFree(load(), now);
}

export function grantTier(tier: SponsorTier, orderId: string, now: number = Date.now()): void {
  save(applyGrant(load(), tier, orderId, now));
}

export function restoreFromOrders(orders: RestoreOrder[]): void {
  save(applyRestore(load(), orders));
}

/* ------------------------------------------------------------------ */
/* 자체 점검 — `npm run check:sponsor`                                  */
/* 만료 계산이 틀리면 돈 문제가 돼요(못 받아야 할 기간을 받거나, 산 기간을 뺏김). */
/* ------------------------------------------------------------------ */
export function demo(): void {
  const eq = (got: unknown, want: unknown, label: string) => {
    if (got !== want) throw new Error(`${label}: ${String(got)} !== ${String(want)}`);
  };

  // applyRestore는 sku로 SPONSOR_TIERS를 조회하므로, 실제 목록에 있는 항목을 써야 해요.
  const oneDay = SPONSOR_TIERS[0]!; // 1일
  const oneWeek = SPONSOR_TIERS[2]!; // 1주일
  const lifetime = SPONSOR_TIERS[7]!; // 평생
  eq(oneDay.days, 1, "테스트 전제: SPONSOR_TIERS[0]은 1일권");
  eq(oneWeek.days, 7, "테스트 전제: SPONSOR_TIERS[2]는 1주일권");
  eq(lifetime.days, null, "테스트 전제: SPONSOR_TIERS[7]은 평생권");
  const now = Date.parse("2026-08-16T00:00:00Z");

  // 처음 상태는 광고 없이 보기가 꺼져 있어요.
  eq(computeAdFree(EMPTY_STATE, now), false, "초기 상태는 미보유");

  // 1일권 구매 → 24시간 뒤 만료.
  let s = applyGrant(EMPTY_STATE, oneDay, "order-1", now);
  eq(s.expiresAt, now + DAY_MS, "1일권 만료시각");
  eq(computeAdFree(s, now), true, "구매 직후엔 보유");
  eq(computeAdFree(s, now + DAY_MS + 1), false, "24시간 뒤엔 만료");

  // 같은 orderId로 다시 지급 시도해도(재시도) 기간이 늘어나지 않아요.
  const sRetry = applyGrant(s, oneDay, "order-1", now + 1000);
  eq(sRetry.expiresAt, s.expiresAt, "같은 orderId 재지급은 무시");

  // 만료 전에 1주일권을 추가로 사면 기존 만료시각부터 이어 붙어요.
  const sStack = applyGrant(s, oneWeek, "order-2", now + 1000);
  eq(sStack.expiresAt, now + DAY_MS + 7 * DAY_MS, "기존 만료시각부터 기간권이 이어붙음");

  // 평생권 구매.
  const sLife = applyGrant(EMPTY_STATE, lifetime, "order-3", now);
  eq(sLife.lifetime, true, "평생권 구매 시 lifetime true");
  eq(computeAdFree(sLife, now + 999 * DAY_MS), true, "평생권은 시간이 지나도 유지");

  // 기기 변경 복원: 완료된 1일권 주문의 결제시각으로 만료를 다시 계산해요.
  const restored = applyRestore(EMPTY_STATE, [
    { sku: oneDay.sku, status: "COMPLETED", date: new Date(now).toISOString() },
  ]);
  eq(restored.expiresAt, now + DAY_MS, "복원: 결제시각 + 기간");

  // 이미 다 써버린(과거) 기간권은 복원해도 되살아나지 않아요.
  const alreadyUsed: SponsorState = { ...EMPTY_STATE, expiresAt: now - DAY_MS };
  const stillExpired = applyRestore(alreadyUsed, [
    { sku: oneDay.sku, status: "COMPLETED", date: new Date(now - 30 * DAY_MS).toISOString() },
  ]);
  eq(stillExpired.expiresAt, now - DAY_MS, "과거에 소진한 기간권은 복원으로 되살아나지 않음");

  // 더 최근에 산 기간권이 있으면(로컬보다 늦은 만료) 그걸로 갱신돼요.
  const newerPurchase = applyRestore(alreadyUsed, [
    { sku: oneWeek.sku, status: "COMPLETED", date: new Date(now).toISOString() },
  ]);
  eq(newerPurchase.expiresAt, now + 7 * DAY_MS, "로컬보다 늦은 복원 후보는 반영됨");

  // 평생권 환불 → 회수. 더 늦은 이력(REFUNDED)이 우선해요.
  const refunded = applyRestore(
    { ...EMPTY_STATE, lifetime: true },
    [
      { sku: lifetime.sku, status: "COMPLETED", date: new Date(now - DAY_MS).toISOString() },
      { sku: lifetime.sku, status: "REFUNDED", date: new Date(now).toISOString() },
    ],
  );
  eq(refunded.lifetime, false, "가장 최근 이력이 REFUNDED면 회수");

  // 시각을 못 읽는 주문은 건너뛰고 로컬 값을 그대로 둬요.
  const unparsable = applyRestore(alreadyUsed, [
    { sku: oneDay.sku, status: "COMPLETED", date: "not-a-date" },
  ]);
  eq(unparsable.expiresAt, alreadyUsed.expiresAt, "시각 파싱 실패 시 로컬 값 유지");

  console.log("sponsorAccess.ts OK");
}
