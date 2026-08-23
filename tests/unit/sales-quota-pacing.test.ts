import { describe, expect, it } from "vitest";

import {
  AHEAD_ABOVE,
  BEHIND_BELOW,
  QUOTA_METRICS,
  QUOTA_METRIC_KEYS,
  computePacing,
  elapsedFraction,
  isMoneyMetric,
  monthBounds,
  paceStatus,
  quotaMetric,
  quotaMetricLabel,
} from "@/lib/sales/quota-pacing";

// A whole calendar month, in UTC, to pace against.
const START = Date.UTC(2026, 7, 1); // Aug 1 2026
const END = Date.UTC(2026, 8, 1); // Sep 1 2026
const HALFWAY = Date.UTC(2026, 7, 16, 12); // midpoint of a 31-day month

describe("quota metric vocabulary", () => {
  it("reuses the names the rest of Sales speaks, with a real data source each", () => {
    expect(QUOTA_METRIC_KEYS).toContain("cash_collected");
    expect(QUOTA_METRIC_KEYS).toContain("deals");
    expect(QUOTA_METRIC_KEYS).toContain("dials");
    for (const m of QUOTA_METRICS) {
      expect(["ledger", "deals", "activity"]).toContain(m.source);
    }
  });

  it("looks a metric up and falls back to the raw key when unknown", () => {
    expect(quotaMetric("cash_collected")?.label).toBe("Cash collected");
    expect(quotaMetric("nope")).toBeUndefined();
    expect(quotaMetricLabel("shows")).toBe("Shows");
    expect(quotaMetricLabel("mystery")).toBe("mystery");
  });

  it("knows only cash is a money metric", () => {
    expect(isMoneyMetric("cash_collected")).toBe(true);
    expect(isMoneyMetric("deals")).toBe(false);
    expect(isMoneyMetric("mystery")).toBe(false);
  });

  it("only cash carries no activity key; the count metrics that need one have it", () => {
    expect(quotaMetric("cash_collected")?.activityKey).toBeUndefined();
    expect(quotaMetric("dials")?.activityKey).toBe("dials");
    expect(quotaMetric("sets_booked")?.activityKey).toBe("sets_booked");
    expect(quotaMetric("calls_taken")?.activityKey).toBe("calls_taken");
  });
});

describe("monthBounds", () => {
  it("returns the half-open [start, nextMonth) interval for a valid month", () => {
    expect(monthBounds("2026-08")).toEqual({ startMs: START, endMs: END });
  });

  it("rolls into the next year for December", () => {
    expect(monthBounds("2026-12")).toEqual({
      startMs: Date.UTC(2026, 11, 1),
      endMs: Date.UTC(2027, 0, 1),
    });
  });

  it("rejects a malformed period", () => {
    expect(() => monthBounds("2026/08")).toThrow(/Expected YYYY-MM/);
    expect(() => monthBounds("nope")).toThrow(/Expected YYYY-MM/);
  });

  it("rejects an out-of-range month", () => {
    expect(() => monthBounds("2026-13")).toThrow(/Month must be/);
    expect(() => monthBounds("2026-00")).toThrow(/Month must be/);
  });
});

describe("elapsedFraction", () => {
  it("is 0 before the period starts", () => {
    expect(elapsedFraction(START, END, START - 1000)).toBe(0);
  });

  it("is 1 after the period ends", () => {
    expect(elapsedFraction(START, END, END + 1000)).toBe(1);
  });

  it("is a fraction mid-period", () => {
    const f = elapsedFraction(START, END, HALFWAY);
    expect(f).toBeGreaterThan(0.4);
    expect(f).toBeLessThan(0.6);
  });

  it("treats a zero-length or inverted period as fully elapsed", () => {
    expect(elapsedFraction(END, END, START)).toBe(1);
    expect(elapsedFraction(END, START, HALFWAY)).toBe(1);
  });
});

describe("paceStatus", () => {
  it("with nothing accrued yet: progress is ahead, none is on track", () => {
    expect(paceStatus(null, 500)).toBe("ahead");
    expect(paceStatus(null, 0)).toBe("on_track");
  });

  it("splits the band into behind / on track / ahead", () => {
    expect(paceStatus(BEHIND_BELOW - 0.01, 1)).toBe("behind");
    expect(paceStatus(1, 1)).toBe("on_track");
    expect(paceStatus(BEHIND_BELOW, 1)).toBe("on_track");
    expect(paceStatus(AHEAD_ABOVE, 1)).toBe("on_track");
    expect(paceStatus(AHEAD_ABOVE + 0.01, 1)).toBe("ahead");
  });
});

describe("computePacing", () => {
  it("prorates the target to the elapsed portion and flags on-track", () => {
    // Halfway through, exactly half collected → dead on the line.
    const p = computePacing({
      targetAmount: 1000,
      actualSoFar: 500,
      startMs: START,
      endMs: END,
      nowMs: HALFWAY,
    });
    expect(p.status).toBe("on_track");
    expect(p.proratedTarget).toBeGreaterThan(400);
    expect(p.proratedTarget).toBeLessThan(600);
    expect(p.pacePct).toBeGreaterThan(0.9);
    expect(p.pacePct).toBeLessThan(1.1);
    expect(p.projectedTotal).not.toBeNull();
    expect(p.remaining).toBe(500);
  });

  it("flags behind when the actual trails the prorated line", () => {
    const p = computePacing({
      targetAmount: 1000,
      actualSoFar: 100,
      startMs: START,
      endMs: END,
      nowMs: HALFWAY,
    });
    expect(p.status).toBe("behind");
    expect(p.attainmentPct).toBeCloseTo(0.1, 5);
  });

  it("flags ahead when the actual outruns the prorated line", () => {
    const p = computePacing({
      targetAmount: 1000,
      actualSoFar: 900,
      startMs: START,
      endMs: END,
      nowMs: HALFWAY,
    });
    expect(p.status).toBe("ahead");
  });

  it("floors remaining at zero once the target is beaten", () => {
    const p = computePacing({
      targetAmount: 1000,
      actualSoFar: 1500,
      startMs: START,
      endMs: END,
      nowMs: END + 1,
    });
    expect(p.remaining).toBe(0);
    expect(p.attainmentPct).toBeCloseTo(1.5, 5);
    expect(p.status).toBe("ahead");
  });

  it("before the period starts: no prorated target, so any progress reads ahead", () => {
    const p = computePacing({
      targetAmount: 1000,
      actualSoFar: 200,
      startMs: START,
      endMs: END,
      nowMs: START - 1,
    });
    expect(p.elapsedFraction).toBe(0);
    expect(p.proratedTarget).toBe(0);
    expect(p.pacePct).toBeNull();
    expect(p.projectedTotal).toBeNull();
    expect(p.status).toBe("ahead");
  });

  it("a zero target has no attainment and no pace, but never divides by zero", () => {
    // Elapsed is positive, so the projection branch runs even with a 0 target.
    const p = computePacing({
      targetAmount: 0,
      actualSoFar: 5,
      startMs: START,
      endMs: END,
      nowMs: HALFWAY,
    });
    expect(p.proratedTarget).toBe(0);
    expect(p.pacePct).toBeNull();
    expect(p.attainmentPct).toBe(0);
    expect(p.projectedTotal).not.toBeNull();
    expect(p.status).toBe("ahead");
    expect(p.remaining).toBe(0);
  });

  it("a zero target with no progress is simply on track", () => {
    const p = computePacing({
      targetAmount: 0,
      actualSoFar: 0,
      startMs: START,
      endMs: END,
      nowMs: HALFWAY,
    });
    expect(p.status).toBe("on_track");
  });
});
