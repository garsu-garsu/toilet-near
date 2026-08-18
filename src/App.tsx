import { closeView, graniteEvent } from "@apps-in-toss/web-framework";
import { useEffect, useRef, useState } from "react";

import { BannerAd } from "./components/BannerAd";
import { HomeScreen } from "./features/home/HomeScreen";
import { SponsorScreen } from "./features/sponsor/SponsorScreen";
import { useAdFreeAccess } from "./hooks/useAdFreeAccess";
import { AD_GROUP_ID_BANNER } from "./lib/env";
import { restoreSponsorAccess } from "./lib/iapRestore";
import { palette } from "./theme";

type View = "home" | "sponsor";

/**
 * 급할 때 여는 앱이라 기본 화면은 홈 하나뿐이에요. "광고 없이 보기" 후원
 * 화면만 예외로 딥링크처럼 얹혀요 — 길찾기를 누르고 돌아왔을 때 하단의
 * 조용한 한 줄에서만 들어갈 수 있고, 진입 흐름 자체엔 끼어들지 않아요.
 */
export default function App() {
  const [view, setView] = useState<View>("home");
  const adFree = useAdFreeAccess();

  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    try {
      return graniteEvent.addEventListener("backEvent", {
        onEvent: () => {
          if (viewRef.current !== "home") {
            setView("home");
          } else {
            try {
              void closeView();
            } catch {
              /* 브라우저 무시 */
            }
          }
        },
      });
    } catch {
      return undefined;
    }
  }, []);

  // 앱 시작 시 1회: 미지급 결제 지급 + 기기 변경 시 구매 이력 복원.
  useEffect(() => {
    void restoreSponsorAccess();
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        {view === "home" ? (
          <HomeScreen onOpenSponsor={() => setView("sponsor")} />
        ) : (
          <SponsorScreen
            onClose={() => setView("home")}
          />
        )}
      </div>
      {/*
        하단 고정 배너.
        자리는 앱이 켜지는 순간부터 잡아두고, 배경도 화면색과 같게 둡니다.
        위치를 잡은 뒤에 자리를 만들면 화면이 다 그려진 다음 아래에서 블록이
        올라오는 모양이 돼서, 심사가 "접속 직후 바텀시트" 로 봅니다(진료중
        20260817-15 반려). 흰 배경으로 미리 잡아두는 것도 같은 이유로 반려된
        적이 있어요(약궁합 20260816-8). 자리는 잡되 눈에 띄지 않게 두는 게 답.
        광고그룹 ID가 없거나 광고 없이 보기가 켜져 있으면 자리 자체를 안 만들어요.
      */}
      {!adFree && AD_GROUP_ID_BANNER !== "" && (
        <div
          style={{
            flexShrink: 0,
            height: 96,
            paddingBottom: "env(safe-area-inset-bottom)",
            background: palette.bg,
          }}
        >
          <BannerAd />
        </div>
      )}
    </div>
  );
}
