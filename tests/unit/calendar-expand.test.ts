import { describe, expect, it } from "vitest";

import { groupByDay, occurrencesFor } from "@/lib/calendar/expand";

const item = (over: Partial<Parameters<typeof occurrencesFor>[0]> = {}) => ({
  status: "not_started",
  cadence: "weekly",
  dueDate: null,
  ...over,
});

describe("occurrencesFor", () => {
  it("an explicit due date wins outright — one slot, cadence ignored", () => {
    const it_ = item({ cadence: "daily", dueDate: "2026-09-10" });
    expect(occurrencesFor(it_, "2026-09-01", "2026-09-30")).toEqual(["2026-09-10"]);
  });

  it("a due date outside the window renders nowhere", () => {
    const it_ = item({ dueDate: "2026-10-02" });
    expect(occurrencesFor(it_, "2026-09-01", "2026-09-30")).toEqual([]);
  });

  it("daily paints every day of the window", () => {
    const days = occurrencesFor(item({ cadence: "daily" }), "2026-09-01", "2026-09-07");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-09-01");
    expect(days[6]).toBe("2026-09-07");
  });

  it("weekly lands on Mondays", () => {
    const days = occurrencesFor(
      item({ cadence: "weekly" }),
      "2026-09-01",
      "2026-09-30",
    );
    expect(days).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("monthly lands on the 1st", () => {
    const days = occurrencesFor(
      item({ cadence: "monthly" }),
      "2026-09-01",
      "2026-10-31",
    );
    expect(days).toEqual(["2026-09-01", "2026-10-01"]);
  });

  it("a COMPLETED recurring task stops painting the future", () => {
    expect(
      occurrencesFor(
        item({ cadence: "daily", status: "completed" }),
        "2026-09-01",
        "2026-09-07",
      ),
    ).toEqual([]);
  });

  it("a completed DATED task keeps its slot — finished work is history", () => {
    const it_ = item({ status: "completed", dueDate: "2026-09-03" });
    expect(occurrencesFor(it_, "2026-09-01", "2026-09-30")).toEqual(["2026-09-03"]);
  });

  it("an inverted or malformed window yields nothing rather than looping", () => {
    expect(
      occurrencesFor(item({ cadence: "daily" }), "2026-09-30", "2026-09-01"),
    ).toEqual([]);
    expect(occurrencesFor(item({ cadence: "daily" }), "garbage", "2026-09-01")).toEqual(
      [],
    );
  });
});

describe("groupByDay", () => {
  it("stacks a daily task alongside a dated one on the same day", () => {
    const daily = item({ cadence: "daily" });
    const dated = item({ dueDate: "2026-09-02" });
    const grid = groupByDay([daily, dated], "2026-09-01", "2026-09-03");
    expect(grid.get("2026-09-02")).toHaveLength(2);
    expect(grid.get("2026-09-01")).toHaveLength(1);
  });
});
