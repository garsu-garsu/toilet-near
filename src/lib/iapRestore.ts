import { IAP, TossAuth } from "@apps-in-toss/web-framework";

import { grantTier, restoreFromOrders, tierBySku } from "./sponsorAccess";

/**
 * 앱 시작 시 1회. 표준 복원 루틴(`platform-facts.md` §1)이에요.
 *
 * 1. 미지급 주문(`getPendingOrders`) → 지급 → `completeProductGrant`.
 * 2. 완료/환불 이력(`getCompletedOrRefundedOrders`) → 기기 변경 대응으로
 *    로컬 만료시각·평생권 상태를 다시 계산.
 *
 * ⚠️ 결제한 적 없는 사람에게는 아무 호출도 하지 않아요. 토스 로그인 연동
 *    여부만 조용히 확인하고, 연동이 없으면 그대로 끝냅니다. 진입 직후에
 *    결제 SDK 를 건드리면 그때 뜨는 창이 심사에서 "접속 직후 바텀시트"로
 *    잡혀요(20260817-14 반려 사유). 결제는 토스 계정 단위로 연동되니,
 *    한 번이라도 산 사람은 기기를 바꿔도 연동이 남아 복원이 그대로 돌아요.
 *
 * 토스 앱 밖(브라우저)이나 미지원 버전에서는 `isSupported()`가 false이거나
 * 호출이 던질 수 있어요. 전부 조용히 무시하고, 앱은 정상 동작해요.
 */
export async function restoreSponsorAccess(): Promise<void> {
  try {
    if (!TossAuth.isIntegrated.isSupported()) return;
    if ((await TossAuth.isIntegrated()) !== true) return;
  } catch (err) {
    console.error("토스 로그인 연동 확인 실패:", err);
    return;
  }

  try {
    if (IAP.getPendingOrders.isSupported()) {
      const pending = await IAP.getPendingOrders();
      for (const order of pending?.orders ?? []) {
        const tier = tierBySku(order.sku);
        if (tier == null) continue;
        grantTier(tier, order.orderId);
        try {
          await IAP.completeProductGrant({ params: { orderId: order.orderId } });
        } catch (err) {
          // 지급 확정 API가 실패해도 로컬 권한은 이미 열려 있어요.
          // 다음 실행 때 같은 주문이 다시 미지급으로 오면 grantTier가 orderId로
          // 중복 지급을 막아줘요.
          console.error("결제 지급 확정 실패:", err);
        }
      }
    }
  } catch (err) {
    console.error("미지급 주문 확인 실패:", err);
  }

  try {
    if (IAP.getCompletedOrRefundedOrders.isSupported()) {
      const res = await IAP.getCompletedOrRefundedOrders();
      restoreFromOrders(res?.orders ?? []);
    }
  } catch (err) {
    console.error("구매 이력 복원 실패:", err);
  }
}
