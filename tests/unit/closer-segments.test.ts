import { describe, expect, it } from "vitest";

import type { CallLogRow } from "@/lib/calls/call-log";
import {
  NO_CLOSER,
  NO_REPORT,
  NO_SETTER,
  segmentByCloser,
  segmentBySetter,
} from "@/lib/calls/closer-segments";

function row(extra: Partial<CallLogRow>): CallLogRow {
  return {
    bookingId: Math.random().toString(36).slice(2),
    inviteeName: null,
    inviteeEmail: "lead@x.com",
    startsAt: new Date("2026-09-10T15:00:00Z"),
    eventType: null,
    provider: "calendly",
    rescheduled: false,
    state: "reported",
    confirmation: "none",
    confirmedRole: null,
    outcome: "showed",
    outcomeWords: "follow up",
    reportSource: "sheet",
    closer: "Jordan Rivers",
    setter: null,
    closeType: null,
    reportedCashCents: null,
    reportedRevenueCents: null,
    cancelReason: null,
    movedTo: null,
    movedFrom: null,
    ...extra,
  };
}

describe("segmentByCloser", () => {
  const log: CallLogRow[] = [
    row({ closer: "Jordan Rivers", outcome: "closed" }),
    row({ closer: "jordan rivers", outcome: "showed" }),
    row({ closer: "Jordan", outcome: "no_show" }),
    row({ closer: "Sam Carter", outcome: "closed" }),
    row({ closer: "Sam Carter", outcome: "closed" }),
    row({ closer: null, outcome: "showed" }),
    row({ closer: "  ", outcome: "no_show" }),
    row({ state: "needs_outcome", outcome: null, closer: null }),
    // Not held: excluded everywhere.
    row({ closer: "Jordan Rivers", outcome: "not_held" }),
    row({ state: "upcoming", outcome: null }),
    row({ state: "cancelled", outcome: "closed" }),
    row({ state: "reported", outcome: null, closer: "Sam Carter" }),
  ];
  const { rows, total } = segmentByCloser(log);

  it("re-cuts held calls per closer, merging name variants, unattributed rows last", () => {
    expect(rows.map((r) => [r.closer, r.held, r.shows, r.noShows, r.closes])).toEqual([
      ["Sam Carter", 2, 2, 0, 2],
      ["Jordan Rivers", 3, 2, 1, 1],
      [NO_CLOSER, 2, 1, 1, 0],
      [NO_REPORT, 1, 0, 0, 0],
    ]);
    expect(rows.map((r) => r.unattributed)).toEqual([false, false, true, true]);
  });

  it("names rates against their denominators, null when there is nothing to divide", () => {
    const jordan = rows.find((r) => r.closer === "Jordan Rivers")!;
    expect(jordan.showRate).toBeCloseTo((2 / 3) * 100);
    expect(jordan.closeRate).toBe(50);
    const noReport = rows.find((r) => r.closer === NO_REPORT)!;
    expect(noReport.showRate).toBeNull();
    expect(noReport.closeRate).toBeNull();
  });

  it("always reconciles: the rows add up to the total", () => {
    const sum = (k: "held" | "shows" | "noShows" | "closes") =>
      rows.reduce((n, r) => n + r[k], 0);
    expect(total).toMatchObject({
      closer: "All held calls",
      held: sum("held"),
      shows: sum("shows"),
      noShows: sum("noShows"),
      closes: sum("closes"),
    });
    expect(total).toMatchObject({ held: 8, shows: 5, noShows: 2, closes: 3 });
    expect(total.closeRate).toBe(60);
  });

  it("breaks ties by held calls, then by name", () => {
    const tied = segmentByCloser([
      row({ closer: "Beth Zed", outcome: "showed" }),
      row({ closer: "Ann Young", outcome: "showed" }),
      row({ closer: "Cal Xu", outcome: "showed" }),
      row({ closer: "Cal Xu", outcome: "no_show" }),
    ]);
    expect(tied.rows.map((r) => r.closer)).toEqual(["Cal Xu", "Ann Young", "Beth Zed"]);
  });

  it("is empty with no held calls", () => {
    const empty = segmentByCloser([row({ state: "upcoming", outcome: null })]);
    expect(empty.rows).toEqual([]);
    expect(empty.total).toMatchObject({ held: 0, showRate: null, closeRate: null });
  });
});

describe("segmentBySetter", () => {
  const log: CallLogRow[] = [
    row({ closer: "Jordan Rivers", setter: "Riley Stone", outcome: "closed" }),
    row({ closer: "Sam Carter", setter: "riley stone", outcome: "no_show" }),
    row({ closer: "Sam Carter", setter: "Avery Lane", outcome: "showed" }),
    row({ closer: "Sam Carter", setter: null, outcome: "closed" }),
    row({ state: "needs_outcome", outcome: null, closer: null, setter: null }),
    row({ setter: "Avery Lane", outcome: "not_held" }),
  ];
  const { rows, total } = segmentBySetter(log);

  it("keys the same held calls on the setter the report names", () => {
    expect(rows.map((r) => [r.closer, r.held, r.shows, r.noShows, r.closes])).toEqual([
      ["Riley Stone", 2, 1, 1, 1],
      ["Avery Lane", 1, 1, 0, 0],
      [NO_SETTER, 1, 1, 0, 1],
      [NO_REPORT, 1, 0, 0, 0],
    ]);
  });

  it("reconciles to the same total as the closer cut of the same calls", () => {
    expect(total).toMatchObject({ held: 5, shows: 3, noShows: 1, closes: 2 });
    expect(segmentByCloser(log).total).toMatchObject({
      held: total.held,
      shows: total.shows,
      noShows: total.noShows,
      closes: total.closes,
    });
  });
});
