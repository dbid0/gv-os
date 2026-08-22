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
