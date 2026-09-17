import { describe, expect, it } from "vitest";

import {
  agencySummary,
  previousMonthKey,
  type BookDeal,
  type SummaryRow,
} from "@/lib/accounting/agency-summary";

/** One reconciled deal row. Figures are fictional — the repo is public. */
const deal = (over: Partial<BookDeal> = {}): BookDeal => ({
  dateClosed: "2026-09-04",
  revenueCents: 500_000,
  cashCents: 500_000,
  feeCents: 0,
  netCents: 500_000,
  arCents: 0,
  danielCents: 250_000,
  gusCents: 250_000,
  payoutStatus: "Paid Out",
  ...over,
});

const TODAY = "2026-09-17";

const row = (s: ReturnType<typeof agencySummary>, key: string): SummaryRow => {
  const hit = s.sections.flatMap((sec) => sec.rows).find((r) => r.key === key);
  expect(hit, `row ${key} should exist`).toBeDefined();
  return hit!;
};

describe("previousMonthKey", () => {
  it("steps back a month, and across the new year", () => {
    expect(previousMonthKey("2026-09")).toBe("2026-08");
    expect(previousMonthKey("2026-01")).toBe("2025-12");
  });
});

describe("agencySummary", () => {
  it("keeps the sheet's rows, in the sheet's order", () => {
    const s = agencySummary([], TODAY);
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
    // The partner rows are always present, even on an empty book. An earlier
    // version read them from a different table and dropped them entirely when
    // that table was empty — which is how the section shipped blank.
    expect(s.sections[1].rows.map((r) => r.label)).toEqual([
      "Daniel payout",
      "Gus payout",
      "Unpaid payouts",
    ]);
  });

  it("buckets by Date Closed into this month, last month and all time", () => {
    const s = agencySummary(
      [
        deal({ dateClosed: "2026-09-04", cashCents: 300_000 }),
        deal({ dateClosed: "2026-08-31", cashCents: 200_000 }),
        deal({ dateClosed: "2026-05-01", cashCents: 100_000 }),
      ],
      TODAY,
    );
    expect(s.thisMonthKey).toBe("2026-09");
    expect(s.lastMonthKey).toBe("2026-08");
    expect(row(s, "cash")).toMatchObject({
      thisMonth: 300_000,
      lastMonth: 200_000,
      allTime: 600_000,
    });
    expect(row(s, "deals")).toMatchObject({ thisMonth: 1, lastMonth: 1, allTime: 3 });
  });

  it("sums revenue and cash independently, so an installment never re-books", () => {
    const s = agencySummary(
      [
        deal({ revenueCents: 1_000_000, cashCents: 400_000 }),
        deal({ revenueCents: 0, cashCents: 600_000 }),
      ],
      TODAY,
    );
    expect(row(s, "revenue").thisMonth).toBe(1_000_000);
    expect(row(s, "cash").thisMonth).toBe(1_000_000);
  });

  it("reads each deal's own partner split, not a flat half", () => {
    // The back catalogue runs 30/40/45/50, which is why all-time Daniel and
    // Gus differ in the real book.
    const s = agencySummary(
      [
        deal({ netCents: 1_000_000, danielCents: 300_000, gusCents: 700_000 }),
        deal({ netCents: 1_000_000, danielCents: 400_000, gusCents: 600_000 }),
      ],
      TODAY,
    );
    expect(row(s, "daniel").allTime).toBe(700_000);
    expect(row(s, "gus").allTime).toBe(1_300_000);
    expect(row(s, "daniel").allTime! + row(s, "gus").allTime!).toBe(
      row(s, "net").allTime,
    );
  });

  it("treats AR and unpaid as all-time balances with blank month cells", () => {
    const s = agencySummary(
      [deal({ arCents: 700_000, payoutStatus: "Not Yet" })],
      TODAY,
    );
    for (const key of ["ar", "unpaid"]) {
      const r = row(s, key);
      expect(r.balanceOnly).toBe(true);
      expect([r.thisMonth, r.lastMonth]).toEqual([null, null]);
    }
    expect(row(s, "ar").allTime).toBe(700_000);
  });

  it("counts both partners' shares of the Not Yet rows as unpaid", () => {
    // The sheet's own definition: Unpaid Payouts (Not Yet).
    const s = agencySummary(
      [
        deal({ danielCents: 150_000, gusCents: 150_000, payoutStatus: "Not Yet" }),
        deal({ danielCents: 375_000, gusCents: 375_000, payoutStatus: "  not yet " }),
        deal({ danielCents: 999_999, gusCents: 1, payoutStatus: "Paid Out" }),
        deal({ danielCents: 999_999, gusCents: 1, payoutStatus: "Pending" }),
      ],
      TODAY,
    );
    expect(row(s, "unpaid").allTime).toBe(1_050_000);
  });

  it("reproduces the shape of the real book", () => {
    // The live sheet's shape on 2026-09-17, with names removed and figures
    // rounded: three September deals all Not Yet, an August deal carrying a
    // large fee, and an older installment row with no revenue.
    const s = agencySummary(
      [
        deal({
          dateClosed: "2026-09-04",
          revenueCents: 500_000,
          cashCents: 300_000,
          netCents: 300_000,
          arCents: 200_000,
          danielCents: 150_000,
          gusCents: 150_000,
          payoutStatus: "Not Yet",
        }),
        deal({
          dateClosed: "2026-09-06",
          revenueCents: 750_000,
          cashCents: 750_000,
          netCents: 750_000,
          danielCents: 375_000,
          gusCents: 375_000,
          payoutStatus: "Not Yet",
        }),
        deal({
          dateClosed: "2026-09-16",
          revenueCents: 1_500_000,
          cashCents: 500_000,
          netCents: 500_000,
          arCents: 1_000_000,
          danielCents: 250_000,
          gusCents: 250_000,
          payoutStatus: "Not Yet",
        }),
        deal({
          dateClosed: "2026-08-25",
          revenueCents: 500_000,
          cashCents: 500_000,
          feeCents: 131_026,
          netCents: 368_974,
          danielCents: 184_487,
          gusCents: 184_487,
        }),
        deal({
          dateClosed: "2026-07-07",
          revenueCents: 0,
          cashCents: 200_000,
          feeCents: 200,
          netCents: 199_800,
          danielCents: 79_920,
          gusCents: 119_880,
        }),
      ],
      TODAY,
    );
    expect(row(s, "revenue")).toMatchObject({
      thisMonth: 2_750_000,
      lastMonth: 500_000,
    });
    expect(row(s, "fees")).toMatchObject({ thisMonth: 0, lastMonth: 131_026 });
    expect(row(s, "deals")).toMatchObject({ thisMonth: 3, lastMonth: 1, allTime: 5 });
    expect(row(s, "ar").allTime).toBe(1_200_000);
    expect(row(s, "unpaid").allTime).toBe(1_550_000);
    expect(row(s, "daniel").thisMonth).toBe(775_000);
    // The uneven older split survives into all time.
    expect(row(s, "gus").allTime! - row(s, "daniel").allTime!).toBe(39_960);
  });

  it("reads an empty book as zeros, not as missing", () => {
    const s = agencySummary([], TODAY);
    for (const r of s.sections.flatMap((sec) => sec.rows)) {
      expect(r.allTime).toBe(0);
    }
  });
});
