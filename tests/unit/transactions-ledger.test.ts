import { describe, expect, it } from "vitest";

import { agencyLedger, type LedgerInputRow } from "@/lib/transactions/ledger";

const row = (o: Partial<LedgerInputRow>): LedgerInputRow => ({
  direction: "in",
  layer: "agency",
  dealType: "Setup",
  paymentMethod: "Fanbasis",
  revenueCents: 0,
  cashCents: 0,
  processorFeeCents: 0,
  ...o,
});

describe("agencyLedger", () => {
  it("folds the breakdown chain: total → after fees → after team → net", () => {
    const { chain } = agencyLedger([
      row({ cashCents: 500_000, revenueCents: 500_000, processorFeeCents: 14_529 }),
      row({
        cashCents: 200_000,
        revenueCents: 300_000,
        processorFeeCents: 0,
        paymentMethod: "Wire",
      }),
      row({ direction: "out", dealType: "Rep Share", cashCents: 50_000 }),
      row({ direction: "out", dealType: "Retainer", cashCents: 25_000 }),
      row({ direction: "out", dealType: "Other", cashCents: 10_000 }),
    ]);
    expect(chain.totalCashCents).toBe(700_000);
    expect(chain.processorFeeCents).toBe(14_529);
    expect(chain.afterFeesCents).toBe(685_471);
    expect(chain.teamCents).toBe(75_000);
    expect(chain.afterTeamCents).toBe(610_471);
    expect(chain.otherOutCents).toBe(10_000);
    expect(chain.netCents).toBe(600_471);
  });

  it("ignores client-layer rows entirely", () => {
    const { chain, byDealType } = agencyLedger([
      row({ cashCents: 100_000 }),
      row({ layer: "client", cashCents: 999_999 }),
    ]);
    expect(chain.totalCashCents).toBe(100_000);
    expect(byDealType).toHaveLength(1);
  });

  it("groups income by deal type and method, largest cash first", () => {
    const { byDealType, byMethod } = agencyLedger([
      row({ dealType: "Setup", cashCents: 100_000, revenueCents: 150_000 }),
      row({ dealType: "Setup", cashCents: 50_000, revenueCents: 50_000 }),
      row({
        dealType: "Retainer",
        cashCents: 200_000,
        revenueCents: 200_000,
        paymentMethod: "Wire",
      }),
      row({ dealType: null, cashCents: 1_000 }),
      row({ dealType: "Other", paymentMethod: null, cashCents: 2_000 }),
    ]);
    expect(byDealType[0]).toMatchObject({ key: "Retainer", cashCents: 200_000 });
    expect(byDealType.find((l) => l.key === "Setup")).toMatchObject({
      count: 2,
      cashCents: 150_000,
      revenueCents: 200_000,
    });
    expect(byDealType.some((l) => l.key === "Uncategorized")).toBe(true);
    expect(byMethod.some((l) => l.key === "Unknown")).toBe(true);
  });

  it("is all zeros on an empty backlog — never invents a figure", () => {
    const { chain, byDealType, byMethod } = agencyLedger([]);
    expect(chain).toEqual({
      totalCashCents: 0,
      processorFeeCents: 0,
      afterFeesCents: 0,
      teamCents: 0,
      afterTeamCents: 0,
      otherOutCents: 0,
      netCents: 0,
    });
    expect(byDealType).toEqual([]);
    expect(byMethod).toEqual([]);
  });
});
