import { describe, expect, it } from "vitest";

import { computeSalesMetrics, type SalesMetricsInput } from "@/lib/sales/metrics";

const base: SalesMetricsInput = {
  cashCents: 5_069_900,
  revenueCents: 5_970_200,
  deals: 19,
  dials: 2_572,
  connects: 306,
  setsBooked: 36,
  callsTaken: 25,
  shows: 25,
  followUps: 15,
  activeReps: 6,
  activeTeams: 3,
};

const byKey = (input: SalesMetricsInput) =>
  Object.fromEntries(computeSalesMetrics(input).map((m) => [m.key, m.value]));

describe("computeSalesMetrics", () => {
  it("formats money, counts, and rates the way the wall reads them", () => {
    const m = byKey(base);
    expect(m.cash).toBe("$50,699.00");
    expect(m.revenue).toBe("$59,702.00");
    expect(m.deals).toBe("19");
    expect(m.dials).toBe("2,572");
    // 19 deals / 25 shows = 76%.
    expect(m["close-rate"]).toBe("76%");
    // 19 / 36 sets = 53%.
    expect(m["set-to-close"]).toBe("53%");
    // 306 connects / 2,572 dials = 12%.
    expect(m["connect-rate"]).toBe("12%");
  });

  it("computes per-unit money from the totals, rounded to whole cents", () => {
    const m = byKey(base);
    // $50,699.00 / 19 = $2,668.37 (266,837 cents).
    expect(m["cash-per-deal"]).toBe("$2,668.37");
    // $59,702.00 / 19 = $3,142.21.
    expect(m["avg-deal"]).toBe("$3,142.21");
  });

  it("shows an em dash, never NaN or a fake 0%, when a denominator is zero", () => {
    const m = byKey({
      ...base,
      deals: 0,
      shows: 0,
      setsBooked: 0,
      dials: 0,
      connects: 0,
    });
    expect(m["cash-per-deal"]).toBe("—");
    expect(m["avg-deal"]).toBe("—");
    expect(m["close-rate"]).toBe("—");
    expect(m["set-to-close"]).toBe("—");
    expect(m["connect-rate"]).toBe("—");
  });

  it("returns the full wall in a stable order", () => {
    const keys = computeSalesMetrics(base).map((m) => m.key);
    expect(keys[0]).toBe("cash");
    expect(keys).toContain("show-rate");
    expect(new Set(keys).size).toBe(keys.length); // no duplicate keys
  });
});
