import { describe, expect, it } from "vitest";

import {
  dailyBrief,
  previousDayKey,
  type BriefInput,
  type BriefTile,
} from "@/lib/brief/daily-brief";

const TODAY = "2026-09-16";
const YESTERDAY = "2026-09-15";

const input = (over: Partial<BriefInput> = {}): BriefInput => ({
  cash: [],
  deals: [],
  calls: [],
  bod: { submitted: 0, total: 0 },
  eod: { submitted: 0, total: 0 },
  ...over,
});

const tile = (tiles: BriefTile[], key: string) => {
  const hit = tiles.find((t) => t.key === key);
  expect(hit, `tile ${key} should exist`).toBeDefined();
  return hit!;
};

describe("previousDayKey", () => {
  it("steps back a day, a month and a year", () => {
    expect(previousDayKey("2026-09-16")).toBe("2026-09-15");
    expect(previousDayKey("2026-09-01")).toBe("2026-08-31");
    expect(previousDayKey("2026-01-01")).toBe("2025-12-31");
    // March 1st in a leap year lands on the 29th, not the 28th.
    expect(previousDayKey("2028-03-01")).toBe("2028-02-29");
  });
});

describe("dailyBrief", () => {
  it("shows the six figures, in the order they are read", () => {
    expect(dailyBrief(input(), TODAY).map((t) => t.key)).toEqual([
      "cashToday",
      "bods",
      "dealsYesterday",
      "cashYesterday",
      "callsYesterday",
      "eods",
    ]);
  });

  it("splits cash between today and yesterday", () => {
    const t = dailyBrief(
      input({
        cash: [
          { day: TODAY, cents: 250_000 },
          { day: TODAY, cents: 100_000 },
          { day: YESTERDAY, cents: 500_000 },
          { day: "2026-09-01", cents: 999_999 },
        ],
      }),
      TODAY,
    );
    expect(tile(t, "cashToday").value).toBe(350_000);
    expect(tile(t, "cashYesterday").value).toBe(500_000);
  });

  it("counts only yesterday's deals and calls", () => {
    const t = dailyBrief(
      input({
        deals: [{ day: YESTERDAY }, { day: YESTERDAY }, { day: TODAY }],
        calls: [{ day: YESTERDAY }, { day: "2026-09-10" }],
      }),
      TODAY,
    );
    expect(tile(t, "dealsYesterday").value).toBe(2);
    expect(tile(t, "callsYesterday").value).toBe(1);
  });

  it("carries the denominator on every report count", () => {
    const t = dailyBrief(
      input({ bod: { submitted: 2, total: 5 }, eod: { submitted: 5, total: 5 } }),
      TODAY,
    );
    expect(tile(t, "bods")).toMatchObject({ value: 2, of: 5, sub: "of 5 reps" });
    expect(tile(t, "eods")).toMatchObject({ value: 5, of: 5, sub: "of 5 reps" });
  });

  it("says one rep, not 1 reps", () => {
    const t = dailyBrief(input({ bod: { submitted: 0, total: 1 } }), TODAY);
    expect(tile(t, "bods").sub).toBe("of 1 rep");
  });

  it("does not report 0 of 0 when nobody is expected to file", () => {
    // "Nobody filed" and "there is nobody to file" are different mornings.
    // Rendering both as 0 would make an empty roster look like a failing team.
    const t = dailyBrief(input({ bod: { submitted: 0, total: 0 } }), TODAY);
    expect(tile(t, "bods")).toMatchObject({
      value: null,
      of: null,
      sub: "no reps on the roster",
    });
  });

  it("shows an honest zero when reps exist but nobody has filed", () => {
    // This one IS a real 0 — it must not be hidden.
    const t = dailyBrief(input({ bod: { submitted: 0, total: 4 } }), TODAY);
    expect(tile(t, "bods")).toMatchObject({ value: 0, of: 4 });
  });

  it("reads a quiet morning as zeros, not as missing", () => {
    const t = dailyBrief(input(), TODAY);
    expect(tile(t, "cashToday").value).toBe(0);
    expect(tile(t, "dealsYesterday").value).toBe(0);
  });

  it("counts every offer's money, not one client's", () => {
    // The brief is the agency's morning. Rows arrive already agency-wide;
    // nothing in here filters by client.
    const t = dailyBrief(
      input({
        cash: [
          { day: TODAY, cents: 100_000 },
          { day: TODAY, cents: 200_000 },
        ],
      }),
      TODAY,
    );
    expect(tile(t, "cashToday").value).toBe(300_000);
  });

  it("handles the first of the month without losing yesterday", () => {
    const t = dailyBrief(
      input({ cash: [{ day: "2026-08-31", cents: 777_00 }] }),
      "2026-09-01",
    );
    expect(tile(t, "cashYesterday").value).toBe(777_00);
  });
});
