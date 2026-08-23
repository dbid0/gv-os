import { describe, expect, it } from "vitest";

import {
  homeHeadline,
  homeMonthRows,
  normalizeHomeMode,
  type HomeRow,
} from "@/lib/transactions/homepage";

const row = (o: Partial<HomeRow>): HomeRow => ({
  direction: "in",
  layer: "agency",
  occurredOn: "2026-08-10",
  revenueCents: 200,
  cashCents: 100,
  ...o,
});

const ROWS = [
  row({}),
  row({ layer: "client", cashCents: 40, revenueCents: 40 }),
  row({ occurredOn: "2026-07-31", cashCents: 999_999 }), // other month
  row({ direction: "out", cashCents: 999_999 }), // outflow
];

describe("normalizeHomeMode", () => {
  it("accepts the three modes and defaults everything else to all", () => {
    expect(normalizeHomeMode("agency")).toBe("agency");
    expect(normalizeHomeMode("clients")).toBe("clients");
    expect(normalizeHomeMode("all")).toBe("all");
    expect(normalizeHomeMode("junk")).toBe("all");
    expect(normalizeHomeMode(null)).toBe("all");
  });
});

describe("homeMonthRows + homeHeadline", () => {
  it("all = both layers, this month, income only", () => {
    expect(homeMonthRows(ROWS, "all", "2026-08")).toHaveLength(2);
    expect(homeHeadline(ROWS, "all", "2026-08")).toEqual({
      collectedCents: 140,
      revenueCents: 240,
    });
  });

  it("agency and clients narrow to their layer", () => {
    expect(homeHeadline(ROWS, "agency", "2026-08")).toEqual({
      collectedCents: 100,
      revenueCents: 200,
    });
    expect(homeHeadline(ROWS, "clients", "2026-08")).toEqual({
      collectedCents: 40,
      revenueCents: 40,
    });
  });

  it("an empty month is zeros, never invented", () => {
    expect(homeHeadline(ROWS, "all", "2026-01")).toEqual({
      collectedCents: 0,
      revenueCents: 0,
    });
  });
});

import {
  homeRangeHeadline,
  homeRangeRows,
  homeRangeSeries,
  normalizeHomeRange,
  rangeBounds,
} from "@/lib/transactions/homepage";

const TODAY = "2026-08-22";

describe("normalizeHomeRange", () => {
  it("accepts presets and defaults junk to month", () => {
    expect(normalizeHomeRange("7d")).toBe("7d");
    expect(normalizeHomeRange("life")).toBe("life");
    expect(normalizeHomeRange("junk")).toBe("month");
    expect(normalizeHomeRange(undefined)).toBe("month");
  });
});

describe("rangeBounds", () => {
  it("computes preset spans in CT day keys", () => {
    expect(rangeBounds("7d", TODAY)).toMatchObject({ from: "2026-08-16", to: TODAY });
    expect(rangeBounds("30d", TODAY)).toMatchObject({ from: "2026-07-24", to: TODAY });
    expect(rangeBounds("month", TODAY)).toMatchObject({
      from: "2026-08-01",
      to: TODAY,
    });
    expect(rangeBounds("last-month", TODAY)).toMatchObject({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(rangeBounds("ytd", TODAY)).toMatchObject({ from: "2026-01-01", to: TODAY });
    expect(rangeBounds("life", TODAY)).toMatchObject({ from: null, to: null });
  });

  it("handles month and year boundaries in day shifting", () => {
    expect(rangeBounds("7d", "2026-01-03").from).toBe("2025-12-28");
    expect(rangeBounds("last-month", "2026-01-15")).toMatchObject({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("computes the RepVision-parity presets", () => {
    // 2026-08-26 is a Wednesday; the week runs back to Sunday the 23rd.
    expect(rangeBounds("this-week", "2026-08-26")).toMatchObject({
      from: "2026-08-23",
      to: "2026-08-26",
      label: "This week",
    });
    // Sunday itself is a one-day week (the day the week began).
    expect(rangeBounds("this-week", "2026-08-23")).toMatchObject({
      from: "2026-08-23",
      to: "2026-08-23",
    });
    // From Q3, last quarter is all of Q2.
    expect(rangeBounds("last-quarter", TODAY)).toMatchObject({
      from: "2026-04-01",
      to: "2026-06-30",
      label: "Last quarter",
    });
    // From Q1, last quarter is Q4 of the prior year.
    expect(rangeBounds("last-quarter", "2026-02-10")).toMatchObject({
      from: "2025-10-01",
      to: "2025-12-31",
    });
    expect(rangeBounds("last-year", TODAY)).toMatchObject({
      from: "2025-01-01",
      to: "2025-12-31",
      label: "Last year",
    });
  });
});

describe("homeRangeRows + homeRangeHeadline", () => {
  it("bounds are inclusive; lifetime takes everything income", () => {
    const bounds = rangeBounds("last-month", TODAY);
    const july = homeRangeRows(ROWS, "all", bounds);
    expect(july).toHaveLength(1);
    expect(homeRangeHeadline(ROWS, "all", bounds).collectedCents).toBe(999_999);
    const life = homeRangeHeadline(ROWS, "all", rangeBounds("life", TODAY));
    expect(life.collectedCents).toBe(100 + 40 + 999_999);
  });

  it("mode still narrows inside a range", () => {
    const life = rangeBounds("life", TODAY);
    expect(homeRangeHeadline(ROWS, "clients", life).collectedCents).toBe(40);
  });
});

import { customBounds } from "@/lib/transactions/homepage";

describe("customBounds", () => {
  it("validates, orders, and labels a dragged range", () => {
    expect(customBounds("2026-08-01", "2026-08-15")).toEqual({
      from: "2026-08-01",
      to: "2026-08-15",
      label: "Custom range",
    });
    expect(customBounds("2026-08-15", "2026-08-01")?.from).toBe("2026-08-01");
    expect(customBounds("junk", "2026-08-01")).toBeNull();
    expect(customBounds(undefined, undefined)).toBeNull();
  });
});

describe("90d preset", () => {
  it("covers the last 90 CT days inclusive", () => {
    expect(rangeBounds("90d", "2026-08-22")).toMatchObject({
      from: "2026-05-25",
      to: "2026-08-22",
    });
  });
});

describe("whop presets", () => {
  it("today/yesterday/4w/12m/qtd compute in CT day keys", () => {
    expect(rangeBounds("today", "2026-08-23")).toMatchObject({
      from: "2026-08-23",
      to: "2026-08-23",
    });
    expect(rangeBounds("yesterday", "2026-08-23")).toMatchObject({
      from: "2026-08-22",
      to: "2026-08-22",
    });
    expect(rangeBounds("4w", "2026-08-23").from).toBe("2026-07-27");
    expect(rangeBounds("12m", "2026-08-23").from).toBe("2025-08-24");
    expect(rangeBounds("qtd", "2026-08-23")).toMatchObject({ from: "2026-07-01" });
    expect(rangeBounds("qtd", "2026-02-10")).toMatchObject({ from: "2026-01-01" });
    expect(rangeBounds("qtd", "2026-11-01")).toMatchObject({ from: "2026-10-01" });
  });
});

describe("homeRangeSeries", () => {
  it("buckets collected cash by day, summed and sorted ascending", () => {
    const life = homeRangeSeries(ROWS, "all", rangeBounds("life", TODAY));
    expect(life).toEqual([
      { day: "2026-07-31", cents: 999_999 },
      { day: "2026-08-10", cents: 140 }, // 100 agency + 40 client, same day
    ]);
  });

  it("respects the mode filter and excludes outflows", () => {
    const clients = homeRangeSeries(ROWS, "clients", rangeBounds("life", TODAY));
    expect(clients).toEqual([{ day: "2026-08-10", cents: 40 }]);
  });

  it("honors the range bounds and returns empty when nothing lands", () => {
    const month = homeRangeSeries(ROWS, "all", rangeBounds("month", TODAY));
    expect(month).toEqual([{ day: "2026-08-10", cents: 140 }]);
    expect(homeRangeSeries(ROWS, "all", rangeBounds("today", TODAY))).toEqual([]);
  });
});
