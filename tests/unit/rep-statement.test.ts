import { describe, expect, it } from "vitest";

import { cents } from "@/lib/money";
import type { RepOwedLine } from "@/lib/sales/commission-rollup";
import { buildRepPayoutStatement } from "@/lib/payouts/rep-statement";

const line: RepOwedLine = {
  repId: "r1",
  role: "closer",
  run: {
    dealCount: 4,
    cashCollectedCents: cents(600_000),
    revenueCents: cents(600_000),
    commissionCents: cents(120_000),
    baseCents: cents(50_000),
    bonusCents: cents(10_000),
    totalOwedCents: cents(180_000),
  },
  skimCents: cents(0),
  totalOwedCents: cents(180_000),
};

describe("buildRepPayoutStatement", () => {
  it("copies every money figure straight from the rollup line", () => {
    const s = buildRepPayoutStatement(line, {
      repName: "Jordan",
      teamName: "The Grid",
      paid: false,
    });
    expect(s).toEqual({
      repId: "r1",
      repName: "Jordan",
      teamName: "The Grid",
      role: "closer",
      dealCount: 4,
      commissionCents: 120_000,
      baseCents: 50_000,
      bonusCents: 10_000,
      skimCents: 0,
      totalOwedCents: 180_000,
      paid: false,
    });
  });

  it("carries a manager's skim into the total via the line, not by re-adding", () => {
    const manager: RepOwedLine = {
      ...line,
      role: "manager",
      skimCents: cents(30_000),
      totalOwedCents: cents(210_000), // run.total 180k + skim 30k, from the rollup
    };
    const s = buildRepPayoutStatement(manager, {
      repName: "Sam",
      teamName: "The Vault",
      paid: true,
    });
    expect(s.skimCents).toBe(30_000);
    expect(s.totalOwedCents).toBe(210_000);
    expect(s.paid).toBe(true);
  });
});
