import { closeView, graniteEvent } from "@apps-in-toss/web-framework";
import { useEffect, useRef, useState } from "react";

import { BannerAd } from "./components/BannerAd";
import { HomeScreen } from "./features/home/HomeScreen";
import { SponsorScreen } from "./features/sponsor/SponsorScreen";
import { useAdFreeAccess } from "./hooks/useAdFreeAccess";
import { AD_GROUP_ID_BANNER } from "./lib/env";
import { restoreSponsorAccess } from "./lib/iapRestore";

type View = "home" | "sponsor";

/**
 * 급할 때 여는 앱이라 기본 화면은 홈 하나뿐이에요. "광고 없이 보기" 후원
 * 화면만 예외로 딥링크처럼 얹혀요 — 길찾기를 누르고 돌아왔을 때 하단의
 * 조용한 한 줄에서만 들어갈 수 있고, 진입 흐름 자체엔 끼어들지 않아요.
 */
export default function App() {
  const [view, setView] = useState<View>("home");
  const adFree = useAdFreeAccess();
  // 홈 화면이 위치/목록을 다 그리기 전엔 배너를 숨겨요 — 안 그러면 진입 직후
  // 하단에 흰 배너 블록만 떠서 바텀시트처럼 보인다는 반려를 받아요.
  const [homeReady, setHomeReady] = useState(false);

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
          <HomeScreen onOpenSponsor={() => setView("sponsor")} onReadyChange={setHomeReady} />
        ) : (
          <SponsorScreen
            onClose={() => {
              // 홈으로 돌아가면 HomeScreen 이 다시 마운트돼 위치를 새로 잡아요 —
              // 그 사이 배너가 잠깐이라도 뜨지 않게 먼저 꺼둡니다.
              setHomeReady(false);
              setView("home");
            }}
          />
        )}
      </div>
      {/*
        광고그룹 ID가 없으면 자리 자체를 만들지 않아요. 배너는 안 뜨는데 96px
        높이만 남아서 하단에 흰 여백이 크게 깔립니다. 나중에 ID를 넣으면
        원래대로 배너 자리가 생겨요. 광고 없이 보기가 켜져 있는 동안도 숨겨요.
        홈 화면일 때는 HomeScreen 이 준비(homeReady)됐을 때만 띄워요 — 후원
        화면에서는 원래대로 항상 보여요.
      */}
      {!adFree && AD_GROUP_ID_BANNER !== "" && (view === "sponsor" || homeReady) && (
        <div
          style={{
            flexShrink: 0,
            height: 96,
            paddingBottom: "env(safe-area-inset-bottom)",
            background: "#FFFFFF",
          }}
        >
          <BannerAd />
        </div>
      )}
    </div>
  );
}
