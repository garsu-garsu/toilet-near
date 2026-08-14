/**
 * 반경 안에 화장실이 하나도 없을 때 보여주는 그림.
 * 사진 대신 SVG 로 직접 그려서 파일 없이 항상 떠요. 뒷모습이라 얼굴 없이도
 * 무슨 상황인지 바로 읽혀요 — 급한데 화장실이 없는, 이 앱에서 가장
 * 절망적인 순간을 웃음으로 넘기려는 그림이에요.
 */
export function NoToilet() {
  return (
    <svg width={180} height={180} viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 땀방울 */}
      <path d="M56 6 C60 12 60 18 56 20 C52 18 52 12 56 6 Z" fill="#8EC9EA" />
      <path d="M90 0 C95 7 95 14 90 16 C85 14 85 7 90 0 Z" fill="#8EC9EA" />
      <path d="M122 8 C126 14 126 19 122 21 C118 19 118 14 122 8 Z" fill="#8EC9EA" />

      {/* 머리(뒷모습이라 얼굴 없음) */}
      <ellipse cx="90" cy="22" rx="17" ry="13" fill="#3B2A1D" />
      <circle cx="90" cy="30" r="16" fill="#F5C9A0" />
      <rect x="84" y="42" width="12" height="10" fill="#F5C9A0" />

      {/* 팔 — 안쪽 아래로 돌려 엉덩이 바깥쪽을 감싸 쥔 모양(얼룩은 손 사이로 보여요) */}
      <path d="M46 66 Q32 104 68 140" stroke="#F5C9A0" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M134 66 Q148 104 104 142" stroke="#F5C9A0" strokeWidth="14" fill="none" strokeLinecap="round" />

      {/* 하늘색 반팔 티셔츠 */}
      <rect x="40" y="52" width="24" height="30" rx="12" fill="#7EC8E3" />
      <rect x="116" y="52" width="24" height="30" rx="12" fill="#7EC8E3" />
      <rect x="54" y="46" width="72" height="70" rx="22" fill="#7EC8E3" />

      {/* 남색 바지 — 무릎을 붙이고 오므린 다리 */}
      <path d="M60 108 Q54 150 74 166 L106 166 Q126 150 120 108 Z" fill="#2B3A67" />

      {/* 얼룩 — 허리선에서 떨어진, 세로로 좁고 긴 자국 */}
      <path
        d="M84,122 L92,128 L86,134 L94,140 L88,148 L80,144 L74,148 L78,138 L70,134 L78,128 Z"
        fill="#7A4B2A"
        stroke="#5C3820"
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {/* 한쪽 다리로 흘러내린 자국 */}
      <path d="M84 144 Q92 151 86 158" stroke="#7A4B2A" strokeWidth={4} fill="none" strokeLinecap="round" />

      {/* 손 — 얼룩 바깥쪽을 감싸 쥠 */}
      <circle cx="68" cy="140" r="10" fill="#F5C9A0" />
      <circle cx="104" cy="142" r="10" fill="#F5C9A0" />

      {/* 신발 */}
      <rect x="66" y="162" width="24" height="10" rx="4" fill="#1B1D21" />
      <rect x="90" y="162" width="24" height="10" rx="4" fill="#1B1D21" />
    </svg>
  );
}
