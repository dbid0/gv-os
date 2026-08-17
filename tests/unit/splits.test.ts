import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { cents, formatUSD, fromDollars, sum } from "@/lib/money";
import {
  allocate,
  allocatePair,
  percentToBps,
  SplitError,
  TOTAL_BPS,
} from "@/lib/splits";

describe("allocate", () => {
  it("splits an even amount cleanly", () => {
    // The real July rev-share row: $1,358.98 net, 50/50.
    const parts = allocate(fromDollars("1358.98"), [5000, 5000]);
    expect(parts.map(formatUSD)).toEqual(["$679.49", "$679.49"]);
  });

  it("gives the odd cent to exactly one party, never both and never neither", () => {
    const parts = allocate(cents(1), [5000, 5000]);
    expect(parts).toEqual([1, 0]);
    expect(sum(parts)).toBe(1);
  });

  it("handles the historical uneven splits", () => {
    expect(allocate(fromDollars("100.00"), [4500, 5500]).map(formatUSD)).toEqual([
      "$45.00",
      "$55.00",
    ]);
    expect(allocate(fromDollars("100.00"), [3000, 7000]).map(formatUSD)).toEqual([
      "$30.00",
      "$70.00",
    ]);
  });

  it("splits refunds exactly as it splits payments, so a reversal nets to zero", () => {
    const payment = fromDollars("1358.99");
    const forward = allocate(payment, [5000, 5000]);
    const reversal = allocate(cents(-payment), [5000, 5000]);

    forward.forEach((part, index) => {
      expect(part + reversal[index]).toBe(0);
    });
  });

  it("returns zeros for a zero total", () => {
    expect(allocate(cents(0), [5000, 5000])).toEqual([0, 0]);
  });

  it("is deterministic: identical input gives identical output", () => {
    const once = allocate(cents(100_003), [3333, 3333, 3334]);
    const twice = allocate(cents(100_003), [3333, 3333, 3334]);
    expect(once).toEqual(twice);
  });

  it("supports more than two parties", () => {
    const parts = allocate(cents(100), [3333, 3333, 3334]);
    expect(sum(parts)).toBe(100);
  });

  it("supports a zero-weight party", () => {
    const parts = allocate(cents(999), [10_000, 0]);
    expect(parts).toEqual([999, 0]);
  });

  describe("rejects splits that would lose or invent money", () => {
    it("when weights do not sum to 100%", () => {
      expect(() => allocate(cents(100), [5000, 4000])).toThrow(SplitError);
      expect(() => allocate(cents(100), [5000, 4000])).toThrow(/sum to 10000/);
    });

    it("when a weight is negative", () => {
      expect(() => allocate(cents(100), [11_000, -1000])).toThrow(/cannot be negative/);
    });

    it("when a weight is fractional", () => {
      expect(() => allocate(cents(100), [5000.5, 4999.5])).toThrow(
        /whole basis points/,
      );
    });

    it("when there are no weights at all", () => {
      expect(() => allocate(cents(100), [])).toThrow(/at least one weight/);
    });
  });

  describe("invariants, over thousands of random inputs", () => {
    const weightsArb = fc
      .array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 6 })
      .map((raw) => {
        // Turn arbitrary ratios into whole basis points summing to exactly 10000.
        const total = raw.reduce((a, b) => a + b, 0);
        const weights = raw.map((r) => Math.floor((r * TOTAL_BPS) / total));
        weights[0] += TOTAL_BPS - weights.reduce((a, b) => a + b, 0);
        return weights;
      });

    const totalArb = fc.integer({ min: -50_000_000, max: 50_000_000 });

    it("the parts always sum to exactly the input", () => {
      fc.assert(
        fc.property(totalArb, weightsArb, (total, weights) => {
          const parts = allocate(cents(total), weights);
          expect(sum(parts)).toBe(total);
        }),
        { numRuns: 2000 },
      );
    });

    it("no party is ever more than one cent from its exact share", () => {
      fc.assert(
        fc.property(totalArb, weightsArb, (total, weights) => {
          const parts = allocate(cents(total), weights);
          parts.forEach((part, index) => {
            const exact = (total * weights[index]) / TOTAL_BPS;
            expect(Math.abs(part - exact)).toBeLessThan(1);
          });
        }),
        { numRuns: 2000 },
      );
    });

    it("every part carries the sign of the total", () => {
      fc.assert(
        fc.property(totalArb, weightsArb, (total, weights) => {
          const parts = allocate(cents(total), weights);
          parts.forEach((part) => {
            if (total > 0) expect(part).toBeGreaterThanOrEqual(0);
            if (total < 0) expect(part).toBeLessThanOrEqual(0);
          });
        }),
        { numRuns: 1000 },
      );
    });
  });
});

describe("allocatePair", () => {
  it("splits 50/50 by default usage", () => {
    const { first, second } = allocatePair(fromDollars("1358.98"), 5000);
    expect(formatUSD(first)).toBe("$679.49");
    expect(formatUSD(second)).toBe("$679.49");
  });

  it("splits 45/55", () => {
    const { first, second } = allocatePair(fromDollars("1000.00"), 4500);
    expect([formatUSD(first), formatUSD(second)]).toEqual(["$450.00", "$550.00"]);
  });
});

describe("percentToBps", () => {
  it("converts whole and two-decimal percentages", () => {
    expect(percentToBps(50)).toBe(5000);
    expect(percentToBps(2.9)).toBe(290);
    expect(percentToBps(7.5)).toBe(750);
    expect(percentToBps(0)).toBe(0);
  });

  it("rejects a percentage finer than one basis point", () => {
    expect(() => percentToBps(50.005)).toThrow(/basis points/);
  });
});
