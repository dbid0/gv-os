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
