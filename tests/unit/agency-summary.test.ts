import { describe, expect, it } from "vitest";

import {
  agencySummary,
  previousMonthKey,
  type BookDeal,
  type PartnerPayoutRow,
  type SummaryRow,
} from "@/lib/accounting/agency-summary";
/** One reconciled deal, as the mirror stored it. */
const deal = (over: Partial<BookDeal> = {}): BookDeal => ({
  dateClosed: "2026-09-01",
  revenueCents: 500_000,
  cashCents: 500_000,
  feeCents: 0,
  netCents: 500_000,
  arCents: 0,
  ...over,
});

const pay = (over: Partial<PartnerPayoutRow> = {}): PartnerPayoutRow => ({
  month: "2026-09",
  partner: "Ada",
  cents: 100_000,
  status: "paid",
  ...over,
});

const row = (s: ReturnType<typeof agencySummary>, key: string): SummaryRow => {
  const hit = s.sections.flatMap((sec) => sec.rows).find((r) => r.key === key);
  expect(hit, `row ${key} should exist`).toBeDefined();
  return hit!;
};

describe("previousMonthKey", () => {
  it("steps back a month, and across the new year", () => {
    expect(previousMonthKey("2026-09")).toBe("2026-08");
    expect(previousMonthKey("2026-01")).toBe("2025-12");
    expect(previousMonthKey("2026-11")).toBe("2026-10");
  });
});

describe("agencySummary", () => {
  it("keeps the sheet's cash rows, in the sheet's order", () => {
    const s = agencySummary([], [], "2026-09-15");
    expect(s.sections.map((x) => x.label)).toEqual([
      "Revenue & cash",
      "Partner payouts",
    ]);
    expect(s.sections[0].rows.map((r) => r.key)).toEqual([
      "revenue",
      "cash",
      "fees",
      "net",
      "ar",
      "deals",
    ]);
  });

  it("buckets each deal into this month, last month and all time", () => {
    const s = agencySummary(
      [
        deal({ dateClosed: "2026-09-04", cashCents: 300_000, revenueCents: 300_000 }),
        deal({ dateClosed: "2026-08-20", cashCents: 200_000, revenueCents: 200_000 }),
        deal({ dateClosed: "2026-05-01", cashCents: 100_000, revenueCents: 100_000 }),
      ],
      [],
      "2026-09-15",
    );

    expect(s.thisMonthKey).toBe("2026-09");
    expect(s.lastMonthKey).toBe("2026-08");
    expect(row(s, "cash")).toMatchObject({
      thisMonth: 300_000,
      lastMonth: 200_000,
      allTime: 600_000,
    });
    // The May deal belongs to all time only.
    expect(row(s, "deals")).toMatchObject({ thisMonth: 1, lastMonth: 1, allTime: 3 });
  });

  it("sums an installment's cash without re-booking its contract", () => {
    // The sheet does this constantly: the contract was booked on an earlier
    // row, so the installment carries $0 revenue and real cash. Pairing them
    // per row would count the contract twice.
    const s = agencySummary(
      [
        deal({ dateClosed: "2026-09-01", revenueCents: 1_000_000, cashCents: 400_000 }),
        deal({ dateClosed: "2026-09-09", revenueCents: 0, cashCents: 600_000 }),
      ],
      [],
      "2026-09-15",
    );

    expect(row(s, "revenue").thisMonth).toBe(1_000_000);
    expect(row(s, "cash").thisMonth).toBe(1_000_000);
  });

  it("carries the fee and net the mirror reconciled", () => {
    const s = agencySummary(
      [deal({ cashCents: 1_000_000, feeCents: 12_345, netCents: 987_655 })],
      [],
      "2026-09-15",
    );
    expect(row(s, "fees").allTime).toBe(12_345);
    expect(row(s, "net").allTime).toBe(987_655);
  });

  it("treats AR as a balance, never a monthly flow", () => {
    const s = agencySummary(
      [deal({ revenueCents: 1_000_000, cashCents: 300_000, arCents: 700_000 })],
      [],
      "2026-09-15",
    );
    const ar = row(s, "ar");
    // The sheet leaves these cells blank on purpose — a month's worth of a
    // balance is not a number, and 0 would read as "nothing owed".
    expect(ar.balanceOnly).toBe(true);
    expect([ar.thisMonth, ar.lastMonth]).toEqual([null, null]);
    expect(ar.allTime).toBe(700_000);
  });

  it("reads an empty book as zeros, not as missing", () => {
    const s = agencySummary([], [], "2026-09-15");
    for (const r of s.sections.flatMap((sec) => sec.rows)) {
      expect(r.allTime).toBe(0);
    }
  });
});

describe("agencySummary — partner payouts", () => {
  it("names a row per partner the payouts book holds, never a hardcoded pair", () => {
    // A third partner must need no code change.
    const s = agencySummary(
      [],
      [
        pay({ partner: "Ada", cents: 100_000 }),
        pay({ partner: "Grace", cents: 90_000 }),
        pay({ partner: "Linus", cents: 10_000 }),
      ],
      "2026-09-15",
    );
    expect(s.sections[1].rows.map((r) => r.label)).toEqual([
      "Ada payout",
      "Grace payout",
      "Linus payout",
      "Unpaid payouts",
    ]);
  });

  it("splits each partner across the three periods", () => {
    const s = agencySummary(
      [],
      [
        pay({ partner: "Ada", month: "2026-09", cents: 50_000 }),
        pay({ partner: "Ada", month: "2026-08", cents: 30_000 }),
        pay({ partner: "Ada", month: "2026-03", cents: 20_000 }),
      ],
      "2026-09-15",
    );
    expect(row(s, "partner:Ada")).toMatchObject({
      thisMonth: 50_000,
      lastMonth: 30_000,
      allTime: 100_000,
    });
  });

  it("reads what was apportioned, not a split recomputed from a default", () => {
    // The back catalogue runs 30/40/45/50 and the percentage is not stored on
    // the transaction, so recomputing would restate most of the book. A 30/70
    // month must survive intact.
    const s = agencySummary(
      [deal({ cashCents: 1_000_000 })],
      [
        pay({ partner: "Ada", cents: 300_000 }),
        pay({ partner: "Grace", cents: 700_000 }),
      ],
      "2026-09-15",
    );
    expect(row(s, "partner:Ada").allTime).toBe(300_000);
    expect(row(s, "partner:Grace").allTime).toBe(700_000);
  });

  it("counts everything not yet paid as still owed", () => {
    const s = agencySummary(
      [],
      [
        pay({ cents: 100_000, status: "paid" }),
        pay({ cents: 40_000, status: "pending" }),
        // Status text from a human is not reliably cased or trimmed.
        pay({ cents: 60_000, status: "  PENDING  " }),
      ],
      "2026-09-15",
    );
    const unpaid = row(s, "unpaid");
    expect(unpaid.allTime).toBe(100_000);
    expect(unpaid.balanceOnly).toBe(true);
    expect([unpaid.thisMonth, unpaid.lastMonth]).toEqual([null, null]);
  });
});
