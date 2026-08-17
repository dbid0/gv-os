import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  add,
  applyBps,
  cents,
  formatUSD,
  fromDollars,
  MoneyError,
  negate,
  subtract,
  sum,
  toDollarsNumber,
  ZERO,
} from "@/lib/money";

describe("cents", () => {
  it("accepts whole numbers including zero and negatives", () => {
    expect(cents(0)).toBe(0);
    expect(cents(135898)).toBe(135898);
    expect(cents(-4102)).toBe(-4102);
    expect(ZERO).toBe(0);
  });

  it("rejects fractional cents", () => {
    expect(() => cents(10.5)).toThrow(MoneyError);
    expect(() => cents(10.5)).toThrow(/whole number/);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => cents(Number.NaN)).toThrow(/finite/);
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(/finite/);
  });

  it("rejects values beyond the safe integer range", () => {
    expect(() => cents(Number.MAX_SAFE_INTEGER + 2)).toThrow(/safe integer/);
  });
});

describe("fromDollars", () => {
  it("parses the cases that break parseFloat", () => {
    // parseFloat("0.29") * 100 === 28.999999999999996
    expect(fromDollars("0.29")).toBe(29);
    expect(fromDollars("1358.98")).toBe(135898);
    expect(fromDollars("1.10")).toBe(110);
    expect(fromDollars("0.07")).toBe(7);
  });

  it("accepts currency symbols, thousands separators, and signs", () => {
    expect(fromDollars("$1,358.98")).toBe(135898);
    expect(fromDollars("-$5.00")).toBe(-500);
    expect(fromDollars("$25,048.15")).toBe(2504815);
    expect(fromDollars("-0.01")).toBe(-1);
  });

  it("treats a single decimal place as tenths", () => {
    expect(fromDollars("1.5")).toBe(150);
  });

  it("accepts whole-dollar numbers", () => {
    expect(fromDollars(5)).toBe(500);
    expect(fromDollars(-5)).toBe(-500);
    expect(fromDollars(0)).toBe(0);
  });

  it("rejects a float, which would already have lost precision", () => {
    expect(() => fromDollars(13.58)).toThrow(/Pass a string/);
  });

  it("rejects more than two decimal places instead of rounding them away", () => {
    expect(() => fromDollars("1.005")).toThrow(/not a valid dollar amount/);
  });

  it("rejects junk", () => {
    expect(() => fromDollars("abc")).toThrow(MoneyError);
    expect(() => fromDollars("")).toThrow(MoneyError);
    expect(() => fromDollars("1.2.3")).toThrow(MoneyError);
    expect(() => fromDollars(Number.NaN)).toThrow(MoneyError);
  });

  it("round-trips through formatUSD for any safe amount", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }), (n) => {
        const amount = cents(n);
        expect(fromDollars(formatUSD(amount))).toBe(amount);
      }),
    );
  });
});

describe("arithmetic", () => {
  it("adds and subtracts exactly", () => {
    expect(add(cents(29), cents(135898))).toBe(135927);
    expect(subtract(cents(140000), cents(4102))).toBe(135898);
    expect(negate(cents(500))).toBe(-500);
    expect(sum([cents(1), cents(2), cents(3)])).toBe(6);
    expect(sum([])).toBe(0);
    expect(add()).toBe(0);
  });

  it("never drifts across a long chain of additions", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100_000, max: 100_000 }), { maxLength: 200 }),
        (values) => {
          const total = sum(values.map((v) => cents(v)));
          const expected = values.reduce((running, v) => running + v, 0);
          expect(total).toBe(expected);
        },
      ),
    );
  });
});

describe("applyBps", () => {
  it("computes the real Fanbasis percentage component", () => {
    // Fanbasis is 2.9% + $0.29. On $1,400.00 the percentage part is $40.60,
    // which plus $0.29 gives the $40.89 actually charged.
    expect(applyBps(fromDollars("1400.00"), 290)).toBe(4060);
    expect(add(applyBps(fromDollars("1400.00"), 290), fromDollars("0.29"))).toBe(4089);
  });

  it("matches the other verified Fanbasis payouts", () => {
    const fee = (dollars: string) =>
      add(applyBps(fromDollars(dollars), 290), fromDollars("0.29"));

    expect(formatUSD(fee("5000.00"))).toBe("$145.29");
    expect(formatUSD(fee("2000.00"))).toBe("$58.29");
    expect(formatUSD(fee("1000.00"))).toBe("$29.29");
    expect(formatUSD(fee("1500.00"))).toBe("$43.79");
  });

  it("rounds half away from zero, symmetrically for credits and debits", () => {
    expect(applyBps(cents(1), 5000)).toBe(1);
    expect(applyBps(cents(-1), 5000)).toBe(-1);
  });

  it("returns zero rather than negative zero", () => {
    expect(Object.is(applyBps(cents(0), 290), 0)).toBe(true);
  });

  it("rejects fractional basis points", () => {
    expect(() => applyBps(cents(100), 2.5)).toThrow(/whole number/);
  });
});

describe("formatUSD", () => {
  it("formats with grouping and two decimals", () => {
    expect(formatUSD(cents(135898))).toBe("$1,358.98");
    expect(formatUSD(cents(0))).toBe("$0.00");
    expect(formatUSD(cents(7))).toBe("$0.07");
    expect(formatUSD(cents(-500))).toBe("-$5.00");
    expect(formatUSD(cents(2504815))).toBe("$25,048.15");
  });

  it("converts to a float only for display", () => {
    expect(toDollarsNumber(cents(135898))).toBeCloseTo(1358.98, 10);
  });
});
