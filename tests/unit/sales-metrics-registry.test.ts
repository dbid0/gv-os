import { describe, expect, it } from "vitest";

import {
  DEFAULT_SALES_METRIC_IDS,
  SALES_METRIC_IDS,
  SALES_METRIC_REGISTRY,
  computeSalesMetrics,
  normalizeSalesMetricIds,
  type SalesMetricsInput,
} from "@/lib/sales/metrics";

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
  commissionOwedCents: 1_250_000,
  eodSubmitted: 4,
  eodTotal: 6,
};

const byKey = (input: SalesMetricsInput) =>
  Object.fromEntries(computeSalesMetrics(input).map((m) => [m.key, m.value]));

describe("sales metric registry", () => {
  it("keeps ids, registry, and the id tuple in lockstep", () => {
    const registryIds = SALES_METRIC_REGISTRY.map((d) => d.id);
    expect(registryIds).toEqual([...SALES_METRIC_IDS]);
    // No duplicate ids in the catalog.
    expect(new Set(SALES_METRIC_IDS).size).toBe(SALES_METRIC_IDS.length);
  });

  it("computes one formatted metric per catalog entry", () => {
    const metrics = computeSalesMetrics(base);
    expect(metrics).toHaveLength(SALES_METRIC_REGISTRY.length);
    expect(metrics.map((m) => m.key)).toEqual([...SALES_METRIC_IDS]);
  });

  it("defaults to the original wall and every default id is real", () => {
    expect(DEFAULT_SALES_METRIC_IDS[0]).toBe("cash");
    for (const id of DEFAULT_SALES_METRIC_IDS) {
      expect(SALES_METRIC_IDS).toContain(id);
    }
  });

  it("derives the new formulas from already-computed values", () => {
    const m = byKey(base);
    // Commission owed is a display of the rollup total, formatted as money.
    expect(m["commission-owed"]).toBe("$12,500.00");
    // 4 of 6 EODs filed = 67%.
    expect(m["eod-compliance"]).toBe("67%");
    // $50,699 collected of $59,702 booked = 85% collection rate.
    expect(m["collection-rate"]).toBe("85%");
    // $50,699.00 / 6 reps = $8,449.83.
    expect(m["cash-per-rep"]).toBe("$8,449.83");
    // 19 deals / 25 calls taken = 76%.
    expect(m["call-to-close"]).toBe("76%");
    // 36 sets / 306 connects = 12%.
    expect(m["connect-to-set"]).toBe("12%");
  });

  it("shows an em dash for a rate or per-unit with no denominator", () => {
    const m = byKey({
      ...base,
      activeReps: 0,
      activeTeams: 0,
      revenueCents: 0,
      eodTotal: 0,
    });
    expect(m["cash-per-rep"]).toBe("—");
    expect(m["cash-per-team"]).toBe("—");
    expect(m["collection-rate"]).toBe("—");
    expect(m["eod-compliance"]).toBe("—");
  });

  it("treats an absent commission source as a real zero, not an em dash", () => {
    const { commissionOwedCents: _omit, ...noCommission } = base;
    void _omit;
    expect(byKey(noCommission)["commission-owed"]).toBe("$0.00");
  });
});

describe("normalizeSalesMetricIds", () => {
  it("falls back to the default wall for junk or empty input", () => {
    expect(normalizeSalesMetricIds(undefined)).toEqual(DEFAULT_SALES_METRIC_IDS);
    expect(normalizeSalesMetricIds(null)).toEqual(DEFAULT_SALES_METRIC_IDS);
    expect(normalizeSalesMetricIds("cash")).toEqual(DEFAULT_SALES_METRIC_IDS);
    expect(normalizeSalesMetricIds([])).toEqual(DEFAULT_SALES_METRIC_IDS);
    expect(normalizeSalesMetricIds(["nope", 7, {}])).toEqual(DEFAULT_SALES_METRIC_IDS);
  });

  it("keeps valid ids, drops unknowns, dedupes, and preserves order", () => {
    expect(
      normalizeSalesMetricIds([
        "revenue",
        "cash",
        "revenue",
        "made-up",
        "eod-compliance",
      ]),
    ).toEqual(["revenue", "cash", "eod-compliance"]);
  });
});
