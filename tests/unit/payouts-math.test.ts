import { describe, expect, it } from "vitest";

import {
  partnerSplitCents,
  PAYOUT_KINDS,
  payoutDealType,
  payoutDirection,
  payoutTotalCents,
} from "@/lib/payouts/math";

describe("payoutDirection", () => {
  it("only rev-share received flows IN; every other kind is money out", () => {
    for (const kind of PAYOUT_KINDS) {
      expect(payoutDirection(kind)).toBe(kind === "revshare_received" ? "in" : "out");
    }
  });
});

describe("payoutDealType", () => {
  it("maps every kind to its backlog label", () => {
    expect(payoutDealType("partner")).toBe("Partner Distribution");
    expect(payoutDealType("rep_share")).toBe("Rep Share");
    expect(payoutDealType("retainer")).toBe("Retainer");
    expect(payoutDealType("processor")).toBe("Processor Fees");
    expect(payoutDealType("ad_spend")).toBe("Ad Spend");
    expect(payoutDealType("revshare_received")).toBe("Rev-Share");
    expect(payoutDealType("other")).toBe("Other");
    expect(payoutDealType("mystery")).toBe("Other");
  });
});

describe("payoutTotalCents", () => {
  it("is base plus signed adjustments", () => {
    expect(payoutTotalCents(100_000, [])).toBe(100_000);
    expect(
      payoutTotalCents(100_000, [{ deltaCents: 5_000 }, { deltaCents: -2_500 }]),
    ).toBe(102_500);
  });
});

describe("partnerSplitCents", () => {
  it("splits 50/50 penny-exact by default — the pair always sums", () => {
    const { danielCents, gusCents } = partnerSplitCents(100_001);
    expect(danielCents + gusCents).toBe(100_001);
    expect(Math.abs(danielCents - gusCents)).toBeLessThanOrEqual(1);
  });

  it("honors a per-case override", () => {
    const { danielCents, gusCents } = partnerSplitCents(100_000, 3000);
    expect(danielCents).toBe(30_000);
    expect(gusCents).toBe(70_000);
  });
});
