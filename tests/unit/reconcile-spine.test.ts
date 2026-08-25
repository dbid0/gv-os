import { describe, expect, it } from "vitest";

import { reconcileSpine, type OfferMonthInput } from "@/lib/accounting/reconcile-spine";

const base: OfferMonthInput = {
  slug: "the-grid",
  name: "The Grid",
  month: "2026-08",
  authority: "forms",
  hasProcessor: false,
  ledgerCashCents: 3_849_100,
  ledgerFeeCents: 0,
  revshareBasisCents: 3_849_100,
  processorCapturedCents: 0,
};

describe("reconcileSpine", () => {
  it("is green when sources, ledger, and rev-share basis all agree (form authority)", () => {
    const r = reconcileSpine([base]);
    expect(r.allGreen).toBe(true);
    expect(r.rows[0].status).toBe("ok");
    expect(r.rows[0].sourceCashCents).toBe(base.ledgerCashCents);
    expect(r.rows[0].cashDeltaCents).toBe(0);
    expect(r.rows[0].basisDeltaCents).toBe(0);
    expect(r.totalCashDriftCents).toBe(0);
  });

  it("flags processor cash captured but not yet in the ledger", () => {
    const r = reconcileSpine([
      {
        ...base,
        authority: "processors",
        hasProcessor: true,
        ledgerCashCents: 1_000_000, // only $10k confirmed into the books
        processorCapturedCents: 1_500_000, // but $15k captured
        revshareBasisCents: 1_000_000,
      },
    ]);
    expect(r.rows[0].status).toBe("drift");
    expect(r.rows[0].cashDeltaCents).toBe(500_000);
    expect(r.driftCount).toBe(1);
    expect(r.allGreen).toBe(false);
    expect(r.rows[0].issues[0]).toContain("not yet in the ledger");
    expect(r.totalCashDriftCents).toBe(500_000);
  });

  it("flags a mis-rated rev-share basis even when cash reconciles", () => {
    const r = reconcileSpine([
      { ...base, revshareBasisCents: 3_000_000 }, // basis should be 3,849,100
    ]);
    expect(r.rows[0].status).toBe("drift");
    expect(r.rows[0].basisDeltaCents).toBe(849_100);
  });

  it("subtracts fees before comparing to the rev-share basis", () => {
    const r = reconcileSpine([
      {
        ...base,
        ledgerCashCents: 1_000_000,
        ledgerFeeCents: 29_000,
        revshareBasisCents: 971_000, // cash minus fees, exactly
        processorCapturedCents: 0,
      },
    ]);
    expect(r.rows[0].basisDeltaCents).toBe(0);
    expect(r.rows[0].status).toBe("ok");
  });

  it("warns (config, not drift) when a processor is connected under form authority", () => {
    const r = reconcileSpine([{ ...base, hasProcessor: true }]);
    expect(r.rows[0].status).toBe("config");
    expect(r.configCount).toBe(1);
    expect(r.allGreen).toBe(true); // config is a warning, not a money failure
    expect(r.rows[0].issues[0]).toContain("processor is connected");
  });

  it("skips the basis check entirely when no rev-share rule applies", () => {
    const r = reconcileSpine([{ ...base, revshareBasisCents: null }]);
    expect(r.rows[0].basisDeltaCents).toBeNull();
    expect(r.rows[0].status).toBe("ok");
  });

  it("orders worst-first: drift, then config, then ok", () => {
    const r = reconcileSpine([
      { ...base, month: "2026-06" }, // ok
      { ...base, month: "2026-07", hasProcessor: true }, // config
      {
        ...base,
        month: "2026-08",
        authority: "processors",
        hasProcessor: true,
        processorCapturedCents: 9_999_999,
      }, // drift
    ]);
    expect(r.rows.map((x) => x.status)).toEqual(["drift", "config", "ok"]);
  });
});
