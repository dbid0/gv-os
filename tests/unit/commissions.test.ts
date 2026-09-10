import { describe, expect, it } from "vitest";

import {
  deriveCommissions,
  resolveRate,
  totalsByRep,
  type CommissionClaim,
  type CommissionPayment,
} from "@/lib/payments/commissions";

const payment = (extra: Partial<CommissionPayment> = {}): CommissionPayment => ({
  id: "p1",
  amountCents: 100000, // $1,000
  kind: "charge",
  clientId: "c1",
  ...extra,
});

const claim = (extra: Partial<CommissionClaim> = {}): CommissionClaim => ({
  paymentEventId: "p1",
  role: "closer",
  repId: "rep1",
  rateOverrideBps: null,
  ...extra,
});

const RULES = [
  { salesRole: "closer", rateBps: 1000, priority: 100 }, // 10%
  { salesRole: "setter", rateBps: 300, priority: 100 }, // 3%
];

describe("resolveRate", () => {
  it("the claim's override beats every rule", () => {
    expect(resolveRate(claim({ rateOverrideBps: 2500 }), RULES)).toBe(2500);
  });

  it("falls to the client rule for the seat", () => {
    expect(resolveRate(claim(), RULES)).toBe(1000);
    expect(resolveRate(claim({ role: "setter" }), RULES)).toBe(300);
  });

  it("no override, no rule = null — unknown, never zero", () => {
    expect(resolveRate(claim({ role: "dm_setter" }), RULES)).toBeNull();
  });

  it("lowest priority number wins when rules stack", () => {
    const stacked = [
      { salesRole: "closer", rateBps: 1000, priority: 100 },
      { salesRole: "closer", rateBps: 1500, priority: 10 },
    ];
    expect(resolveRate(claim(), stacked)).toBe(1500);
  });
});

describe("deriveCommissions", () => {
  it("derives integer cents from bps", () => {
    const rows = deriveCommissions([payment()], [claim()], RULES);
    expect(rows).toEqual([
      {
        paymentEventId: "p1",
        repId: "rep1",
        role: "closer",
        rateBps: 1000,
        commissionCents: 10000, // 10% of $1,000
      },
    ]);
  });

  it("rounds to the nearest cent", () => {
    // $333.33 at 3% = $10.00 after rounding (999.99 cents)
    const rows = deriveCommissions(
      [payment({ amountCents: 33333 })],
      [claim({ role: "setter" })],
      RULES,
    );
    expect(rows[0].commissionCents).toBe(1000);
  });

  it("unknown rate derives null commission, never zero", () => {
    const rows = deriveCommissions([payment()], [claim({ role: "dm_setter" })], RULES);
    expect(rows[0].rateBps).toBeNull();
    expect(rows[0].commissionCents).toBeNull();
  });

  it("refunds derive NEGATIVE commissions — the clawback seed", () => {
    const rows = deriveCommissions(
      [payment({ kind: "refund", amountCents: 50000 })],
      [claim()],
      RULES,
    );
    expect(rows[0].commissionCents).toBe(-5000);
  });

  it("a refund with an unknown rate stays null, like any unknown", () => {
    const rows = deriveCommissions(
      [payment({ kind: "refund" })],
      [claim({ role: "dm_setter" })],
      RULES,
    );
    expect(rows[0].commissionCents).toBeNull();
  });

  it("claims on payments outside the window derive nothing", () => {
    const rows = deriveCommissions(
      [payment()],
      [claim({ paymentEventId: "elsewhere" })],
      RULES,
    );
    expect(rows).toEqual([]);
  });
});

describe("totalsByRep", () => {
  it("sums derivable rows and counts unknowns separately", () => {
    const rows = deriveCommissions(
      [payment(), payment({ id: "p2", amountCents: 50000 })],
      [
        claim(),
        claim({ paymentEventId: "p2", role: "dm_setter" }), // unknown rate
      ],
      RULES,
    );
    const totals = totalsByRep(rows);
    expect(totals).toEqual([{ repId: "rep1", totalCents: 10000, unknownRateRows: 1 }]);
  });

  it("refund rows subtract from the same rep's total", () => {
    const rows = deriveCommissions(
      [payment(), payment({ id: "p2", kind: "refund", amountCents: 100000 })],
      [claim(), claim({ paymentEventId: "p2" })],
      RULES,
    );
    expect(totalsByRep(rows)[0].totalCents).toBe(0);
  });
});
