import { describe, expect, it } from "vitest";

import { callDayKey, type CallLogRow } from "@/lib/calls/call-log";
import { callWeek, weekKeyFor } from "@/lib/calls/call-week";

function row(id: string, startsAt: Date | null): CallLogRow {
  return {
    bookingId: id,
    inviteeName: null,
    inviteeEmail: `${id}@x.com`,
    startsAt,
    eventType: null,
    provider: "calendly",
    rescheduled: false,
    state: "upcoming",
    confirmation: "none",
    outcome: null,
    outcomeWords: null,
    reportSource: null,
    closer: null,
    cancelReason: null,
    movedTo: null,
    movedFrom: null,
  };
}

describe("callDayKey", () => {
  it("keys a call by its Central-time day", () => {
    // 03:00 UTC on the 16th is still the evening of the 15th in Chicago.
    expect(callDayKey(new Date("2026-09-16T03:00:00Z"), "America/Chicago")).toBe(
      "2026-09-15",
    );
    expect(callDayKey(new Date("2026-09-16T06:00:00Z"), "America/Chicago")).toBe(
      "2026-09-16",
    );
  });
});

describe("callDayKey in the viewer's zone", () => {
  it("puts the same moment on each viewer's own day", () => {
    const at = new Date("2026-09-16T03:00:00Z");
    expect(callDayKey(at, "America/Los_Angeles")).toBe("2026-09-15");
    expect(callDayKey(at, "Europe/London")).toBe("2026-09-16");
  });
});

describe("weekKeyFor", () => {
  it("returns the Sunday on or before the wanted date", () => {
    expect(weekKeyFor("2026-09-17", "2026-01-01")).toBe("2026-09-13");
    expect(weekKeyFor("2026-09-13", "2026-01-01")).toBe("2026-09-13");
    // Across a month and a year boundary.
    expect(weekKeyFor("2026-01-01", "2026-09-14")).toBe("2025-12-28");
  });

  it("falls back to today's week for anything that isn't a real date", () => {
    for (const bad of [undefined, "", "next-week", "2026-02-30", "2026-9-1"]) {
      expect(weekKeyFor(bad, "2026-09-14")).toBe("2026-09-13");
    }
  });
});

describe("callWeek", () => {
  const rows = [
    row("late-tue", new Date("2026-09-16T01:30:00Z")), // Tue 15th, 8:30pm Central
    row("early-tue", new Date("2026-09-15T14:00:00Z")),
    row("sun", new Date("2026-09-13T16:00:00Z")),
    row("sat", new Date("2026-09-19T20:00:00Z")),
    row("next-week", new Date("2026-09-20T16:00:00Z")),
    row("last-week", new Date("2026-09-12T16:00:00Z")),
    row("undated", null),
  ];
  const week = callWeek(rows, "2026-09-16", "2026-09-15", "America/Chicago");

  it("lays out seven days from Sunday with neighbours to step to", () => {
    expect(week.weekKey).toBe("2026-09-13");
    expect(week.prevKey).toBe("2026-09-06");
    expect(week.nextKey).toBe("2026-09-20");
    expect(week.days.map((d) => d.dateKey)).toEqual([
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
    ]);
    expect(week.days.filter((d) => d.isToday).map((d) => d.dateKey)).toEqual([
      "2026-09-15",
    ]);
  });

  it("puts each call on its Central-time day, earliest first, and counts undated apart", () => {
    const ids = Object.fromEntries(
      week.days.map((d) => [d.dateKey, d.rows.map((r) => r.bookingId)]),
    );
    expect(ids["2026-09-13"]).toEqual(["sun"]);
    expect(ids["2026-09-15"]).toEqual(["early-tue", "late-tue"]);
    expect(ids["2026-09-19"]).toEqual(["sat"]);
    expect(ids["2026-09-16"]).toEqual([]);
    expect(week.days.flatMap((d) => d.rows).map((r) => r.bookingId)).not.toContain(
      "next-week",
    );
    expect(week.undated).toBe(1);
  });
});
