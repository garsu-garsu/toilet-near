import { useEffect, useState } from "react";

import { hasAdFreeAccess } from "../lib/sponsorAccess";

/** 지금 광고 없이 볼 수 있는지. 화면 복귀·1분 간격으로 다시 확인해서 만료를 반영해요. */
export function useAdFreeAccess(): boolean {
  const [adFree, setAdFree] = useState(() => hasAdFreeAccess());

  useEffect(() => {
    const check = () => setAdFree(hasAdFreeAccess());
    check();
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
  }, []);

  return adFree;
}
