import { describe, expect, it } from "vitest";

import {
  reconcileAgency,
  type AgencyMonthInput,
} from "@/lib/accounting/reconcile-agency";

const month = (o: Partial<AgencyMonthInput>): AgencyMonthInput => ({
  month: "2026-08",
  ledgerCashCents: 12_350_000,
  capturedCents: 0,
  pendingCaptureCents: 0,
  ...o,
});

describe("reconcileAgency", () => {
  it("is green when the agency book has no pending captures (direct income)", () => {
    const r = reconcileAgency([month({})]);
    expect(r.allGreen).toBe(true);
    expect(r.rows[0].status).toBe("ok");
    expect(r.rows[0].driftCents).toBe(0);
    expect(r.ledgerTotalCents).toBe(12_350_000);
    expect(r.totalDriftCents).toBe(0);
  });

  it("flags agency processor cash captured but not yet in the book", () => {
    const r = reconcileAgency([
      month({ capturedCents: 500_000, pendingCaptureCents: 200_000 }),
    ]);
    expect(r.rows[0].status).toBe("drift");
    expect(r.rows[0].driftCents).toBe(200_000);
    expect(r.driftCount).toBe(1);
    expect(r.allGreen).toBe(false);
    expect(r.rows[0].issues[0]).toContain("not yet in the book");
    expect(r.totalDriftCents).toBe(200_000);
  });

  it("totals ledger cash across months and orders newest first", () => {
    const r = reconcileAgency([
      month({ month: "2026-07", ledgerCashCents: 5_000_000 }),
      month({ month: "2026-08", ledgerCashCents: 12_350_000 }),
    ]);
    expect(r.rows.map((x) => x.month)).toEqual(["2026-08", "2026-07"]);
    expect(r.ledgerTotalCents).toBe(17_350_000);
  });

  it("is trivially green on an empty agency book", () => {
    const r = reconcileAgency([]);
    expect(r.allGreen).toBe(true);
    expect(r.ledgerTotalCents).toBe(0);
    expect(r.rows).toEqual([]);
  });
});
