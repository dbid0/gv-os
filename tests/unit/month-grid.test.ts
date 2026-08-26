import { describe, expect, it } from "vitest";

import {
  monthGrid,
  monthLabel,
  parseYearMonth,
  stepMonth,
} from "@/lib/calendar/month-grid";

describe("monthGrid", () => {
  it("covers August 2026 in Sunday-first weeks", () => {
    // Aug 1 2026 is a Saturday, so the first week is Jul 26–Aug 1.
    const weeks = monthGrid(2026, 8, "2026-08-25");
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[0][0].dateKey).toBe("2026-07-26"); // Sunday before
    expect(weeks[0][6].dateKey).toBe("2026-08-01"); // the 1st, a Saturday
    expect(weeks[0][6].inMonth).toBe(true);
    expect(weeks[0][0].inMonth).toBe(false);
  });

  it("marks today", () => {
    const weeks = monthGrid(2026, 8, "2026-08-25");
    const todays = weeks.flat().filter((c) => c.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0].dateKey).toBe("2026-08-25");
    expect(todays[0].day).toBe(25);
  });

  it("contains all 31 in-month days exactly once", () => {
    const inMonth = monthGrid(2026, 8, "2026-08-25")
      .flat()
      .filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(new Set(inMonth.map((c) => c.day)).size).toBe(31);
  });

  it("drops a trailing all-next-month 6th week", () => {
    // February 2026 (28 days) starting on a Sunday would fit in 4 weeks; most
    // months are 5 rows. Whatever the month, no all-out-of-month trailing row.
    for (const month of [1, 2, 3, 11, 12]) {
      const weeks = monthGrid(2026, month, "2026-01-01");
      const last = weeks[weeks.length - 1];
      expect(last.some((c) => c.inMonth)).toBe(true);
    }
  });
});

describe("stepMonth", () => {
  it("advances and wraps the year forward", () => {
    expect(stepMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
  it("steps back across the year boundary", () => {
    expect(stepMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it("is the identity for a zero delta", () => {
    expect(stepMonth(2026, 6, 0)).toEqual({ year: 2026, month: 6 });
  });
});

describe("monthLabel", () => {
  it("names the month and year", () => {
    expect(monthLabel(2026, 8)).toBe("August 2026");
  });
});

describe("parseYearMonth", () => {
  it("parses a valid YYYY-MM", () => {
    expect(parseYearMonth("2026-08")).toEqual({ year: 2026, month: 8 });
  });
  it("rejects malformed or out-of-range input", () => {
    expect(parseYearMonth(undefined)).toBeNull();
    expect(parseYearMonth("2026-13")).toBeNull();
    expect(parseYearMonth("nope")).toBeNull();
    expect(parseYearMonth("2026-00")).toBeNull();
  });
});
