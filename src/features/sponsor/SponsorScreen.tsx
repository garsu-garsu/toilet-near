import { IAP } from "@apps-in-toss/web-framework";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { Card } from "../../components/ScreenLayout";
import { EVENT, track, trackScreen } from "../../lib/analytics";
import { grantTier, tierBySku, type SponsorTier } from "../../lib/sponsorAccess";
import { ensureTossLogin } from "../../lib/tossLogin";
import { palette } from "../../theme";

interface MergedTier extends SponsorTier {
  displayName: string;
  displayAmount: string;
}

type Status = "loading" | "ready" | "empty" | "unsupported";
type Purchase = { sku: string; phase: "buying" | "done" } | null;

/** 기간 라벨. days는 SPONSOR_TIERS(정확히 8종)에서만 오므로 표에 없는 값은 없어요. */
function tierLabel(days: number | null): string {
  switch (days) {
    case null:
      return "평생";
    case 1:
      return "1일";
    case 3:
      return "3일";
    case 7:
      return "1주일";
    case 30:
      return "1개월";
    case 90:
      return "3개월";
    case 180:
      return "6개월";
    case 365:
      return "1년";
    default:
      return `${days}일`;
  }
}

export function SponsorScreen({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status>("loading");
  const [tiers, setTiers] = useState<MergedTier[]>([]);
  const [purchase, setPurchase] = useState<Purchase>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackScreen("sponsor");
    let alive = true;
    (async () => {
      try {
        if (!IAP.getProductItemList.isSupported()) {
          if (alive) setStatus("unsupported");
          return;
        }
        const res = await IAP.getProductItemList();
        const merged = (res?.products ?? [])
          .map((p) => {
            const tier = tierBySku(p.sku);
            return tier == null
              ? null
              : { ...tier, displayName: p.displayName, displayAmount: p.displayAmount };
          })
          .filter((t): t is MergedTier => t != null)
          // 콘솔 응답 순서 대신 짧은 기간부터 고정된 순서로 보여줘요. 평생(null)은 맨 뒤.
          .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
        if (!alive) return;
        setTiers(merged);
        setStatus(merged.length > 0 ? "ready" : "empty");
      } catch (err) {
        console.error("후원 상품 조회 실패:", err);
        if (alive) setStatus("empty");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const buy = useCallback((tier: MergedTier) => {
    setError(null);
    setPurchase({ sku: tier.sku, phase: "buying" });
    void (async () => {
      await ensureTossLogin();
      let cleanup = () => {};
      try {
        cleanup = IAP.createOneTimePurchaseOrder({
          options: {
            sku: tier.sku,
            processProductGrant: ({ orderId }) => {
              grantTier(tier, orderId);
              return true;
            },
          },
          onEvent: (event) => {
            track(EVENT.sponsorPurchased, {
              sku: tier.sku,
              days: tier.days ?? -1,
              displayName: event.data.displayName,
            });
            setPurchase({ sku: tier.sku, phase: "done" });
            cleanup();
          },
          onError: (err) => {
            console.error("후원 결제 실패:", err);
            setError("결제를 완료하지 못했어요. 다시 시도해 주세요.");
            setPurchase(null);
            cleanup();
          },
        });
      } catch (err) {
        console.error("후원 결제 시작 실패:", err);
        setError("결제를 시작하지 못했어요.");
        setPurchase(null);
      }
    })();
  }, []);

  if (purchase?.phase === "done") {
    const tier = tiers.find((t) => t.sku === purchase.sku);
    return (
      <Screen title="후원해 주셔서 고마워요" onClose={onClose}>
        <Card style={{ textAlign: "center", padding: 24 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: palette.ink, margin: "0 0 6px" }}>
            {tier != null ? `${tierLabel(tier.days)} 동안 ` : ""}광고 없이 볼 수 있어요
          </p>
          <p style={{ fontSize: 14, color: palette.sub, margin: 0 }}>
            바로 적용됐어요. 화면을 닫아도 괜찮아요.
          </p>
          <button type="button" onClick={onClose} style={primaryBtnStyle}>
            확인
          </button>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="광고 없이 보기" onClose={onClose}>
      <p style={{ fontSize: 14, color: palette.sub, margin: "0 0 16px", lineHeight: 1.6 }}>
        도움이 되셨다면, 원하는 기간만큼 광고 없이 볼 수 있어요.
      </p>

      {status === "loading" && <Notice text="상품을 불러오고 있어요…" />}
      {status === "unsupported" && <Notice text="이 화면은 토스 앱에서만 결제할 수 있어요." />}
      {status === "empty" && <Notice text="지금은 후원 상품을 준비 중이에요." />}

      {status === "ready" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tiers.map((tier) => (
            <TierRow
              key={tier.sku}
              tier={tier}
              buying={purchase?.sku === tier.sku && purchase.phase === "buying"}
              disabled={purchase != null}
              onBuy={() => buy(tier)}
            />
          ))}
        </div>
      )}

      {error != null && (
        <p style={{ fontSize: 13, color: palette.unknown, marginTop: 12 }}>{error}</p>
      )}
    </Screen>
  );
}

function TierRow({
  tier,
  buying,
  disabled,
  onBuy,
}: {
  tier: MergedTier;
  buying: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  return (
    <Card onClick={disabled ? undefined : onBuy} style={{ opacity: disabled && !buying ? 0.5 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 19, fontWeight: 800, color: palette.ink }}>
          {tierLabel(tier.days)}
        </span>
        <span style={{ fontSize: 19, fontWeight: 800, color: palette.primary }}>
          {buying ? "결제 중…" : tier.displayAmount}
        </span>
      </div>
    </Card>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <Card style={{ textAlign: "center", padding: 24 }}>
      <p style={{ fontSize: 15, color: palette.sub, margin: 0, lineHeight: 1.6 }}>{text}</p>
    </Card>
  );
}

function Screen({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: palette.bg }}>
      <div style={{ padding: "max(16px, env(safe-area-inset-top)) 16px 8px", flexShrink: 0 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "transparent",
            color: palette.sub,
            fontSize: 15,
            fontWeight: 700,
            padding: 0,
            marginBottom: 8,
          }}
        >
          ‹ 닫기
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: palette.ink, margin: 0 }}>{title}</h1>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "8px 16px calc(24px + env(safe-area-inset-bottom))",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const primaryBtnStyle: CSSProperties = {
  width: "100%",
  marginTop: 16,
  border: "none",
  borderRadius: 12,
  padding: "14px 0",
  fontSize: 16,
  fontWeight: 700,
  color: palette.white,
  background: palette.primary,
};
