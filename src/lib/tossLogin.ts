import { TossAuth } from "@apps-in-toss/web-framework";

/**
 * 결제 버튼을 누른 시점에만 호출해요 — 앱 진입·화면 로드 시에는 절대 부르지 않아요.
 *
 * `IAP.getCompletedOrRefundedOrders`(기기 변경 복원)가 토스 로그인 연동을 전제로 해요
 * (`platform-facts.md` §1). 여기서는 이름 등 추가 동의는 받지 않고 연동 여부만 확인·진행해요
 * — 연결끊기(회원탈퇴) 엔드포인트가 필요 없는 최소 연동이에요(`review.md` §5).
 *
 * 미지원 환경(브라우저·구버전)에서는 조용히 넘어가요. 그 환경에서는 결제 자체가
 * 안 되거나 결제 화면이 실패 사유를 보여줘요.
 */
export async function ensureTossLogin(): Promise<void> {
  try {
    if (!TossAuth.isIntegrated.isSupported()) return;
    const integrated = await TossAuth.isIntegrated();
    if (integrated === true) return;
    await TossAuth.login();
  } catch (err) {
    console.error("토스 로그인 연동 실패:", err);
  }
}
