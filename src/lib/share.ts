/**
 * 공유.
 *
 * 새 사용자가 들어오는 가장 싼 길이에요 — 급할 때 화장실을 찾아준 경험은
 * 그 자리에서 옆사람에게 말해주게 되니까요. 공유 문구에 토스 공유 링크를
 * 붙여서, 받은 사람이 누르면 바로 이 미니앱이 열려요.
 *
 * 실패해도(미지원 버전·브라우저) 조용히 넘어가요. 공유가 안 되는 것뿐이고
 * 화장실 찾기는 그대로 돼야 해요.
 */
import { getTossShareLink, Share } from "@apps-in-toss/web-framework";

import { EVENT, track } from "./analytics.ts";
import { formatDistance } from "./geo.ts";
import { hoursLabel } from "./hours.ts";
import type { Toilet } from "./toilets.ts";

/** 링크를 못 받으면 문구만이라도 보내요. */
async function tossLink(): Promise<string> {
  try {
    return await getTossShareLink("intoss://toilet-near");
  } catch (err) {
    console.error("공유 링크 생성 실패:", err);
    return "";
  }
}

export async function shareToilet(t: Toilet): Promise<void> {
  const link = await tossLink();
  const message = [
    `가까운 화장실 · ${t.name}`,
    `${formatDistance(t.distance)} · ${hoursLabel(t.hours)}`,
    link,
  ]
    .filter((s) => s !== "")
    .join("\n");

  try {
    // Share.sendMessage 에는 isSupported 가 없어요(SDK 타입 확인). 미지원
    // 환경에서는 호출이 던지니 catch 로 받습니다.
    await Share.sendMessage({ message });
    track(EVENT.shareCompleted, { name: t.name });
  } catch (err) {
    console.error("공유 실패:", err);
  }
}
