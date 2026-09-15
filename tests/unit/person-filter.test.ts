import { describe, expect, it } from "vitest";

import type { CallLogRow } from "@/lib/calls/call-log";
import { callScoreboard } from "@/lib/calls/call-scoreboard";
import { segmentByCloser, segmentBySetter } from "@/lib/calls/closer-segments";
import {
  filterDialsByPerson,
  filterLogByPerson,
  personOptions,
  personParam,
  readPersonFilter,
} from "@/lib/calls/person-filter";

const TZ = "America/Chicago";
const ALL = { from: null, to: null, label: "All time" };

let n = 0;
function row(extra: Partial<CallLogRow>): CallLogRow {
  n += 1;
  return {
    bookingId: `b${n}`,
    inviteeName: null,
    inviteeEmail: `lead${n}@example.test`,
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
    closer: null,
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

const log: CallLogRow[] = [
  row({ closer: "Sam Carter", setter: "Riley Stone", outcome: "closed" }),
  row({ closer: "sam", setter: "riley stone", outcome: "no_show" }),
  row({ closer: "Sam Carter", setter: null, outcome: "showed" }),
  row({ closer: "Jordan Rivers", setter: "Avery Lane", outcome: "closed" }),
  row({ closer: "  ", setter: "Avery Lane", outcome: "showed" }),
  row({ state: "needs_outcome", outcome: null, outcomeWords: null }),
];

describe("personOptions", () => {
  it("lists merged closer and setter names, sorted", () => {
    expect(personOptions(log)).toEqual({
      closers: ["Jordan Rivers", "Sam Carter"],
      setters: ["Avery Lane", "Riley Stone"],
    });
  });
});

describe("readPersonFilter", () => {
  const options = personOptions(log);

  it("reads a closer or setter the offer's reports name, in any case", () => {
    expect(readPersonFilter("closer:sam carter", options)).toEqual({
      by: "closer",
      name: "Sam Carter",
    });
    expect(readPersonFilter("setter: Avery Lane ", options)).toEqual({
      by: "setter",
      name: "Avery Lane",
    });
  });

  it("ignores anything else rather than cutting to nobody", () => {
    expect(readPersonFilter("closer:Nobody", options)).toBeNull();
    expect(readPersonFilter("rep:Sam Carter", options)).toBeNull();
    expect(readPersonFilter(":Sam Carter", options)).toBeNull();
    expect(readPersonFilter("Sam Carter", options)).toBeNull();
    expect(readPersonFilter(undefined, options)).toBeNull();
    expect(readPersonFilter(["closer:Sam Carter"], options)).toBeNull();
    expect(readPersonFilter("setter:Sam Carter", options)).toBeNull();
  });

  it("round-trips through its URL value", () => {
    const f = { by: "setter" as const, name: "Riley Stone" };
    expect(readPersonFilter(personParam(f), options)).toEqual(f);
  });
});

describe("filterLogByPerson", () => {
  it("keeps the calls whose report names the person, spellings merged", () => {
    const sam = filterLogByPerson(log, { by: "closer", name: "Sam Carter" });
    expect(sam.map((r) => r.bookingId)).toEqual([
      log[0].bookingId,
      log[1].bookingId,
      log[2].bookingId,
    ]);
    const riley = filterLogByPerson(log, { by: "setter", name: "Riley Stone" });
    expect(riley).toHaveLength(2);
  });

  it("agrees with that person's row in calls-by-closer and calls-by-setter", () => {
    const sam = callScoreboard(
      filterLogByPerson(log, { by: "closer", name: "Sam Carter" }),
      ALL,
      TZ,
    );
    const samRow = segmentByCloser(log).rows.find((r) => r.closer === "Sam Carter")!;
    expect([sam.held, sam.shows, sam.noShows, sam.closes]).toEqual([
      samRow.held,
      samRow.shows,
      samRow.noShows,
      samRow.closes,
    ]);
    const avery = callScoreboard(
      filterLogByPerson(log, { by: "setter", name: "Avery Lane" }),
      ALL,
      TZ,
    );
    const averyRow = segmentBySetter(log).rows.find((r) => r.closer === "Avery Lane")!;
    expect([avery.held, avery.shows, avery.closes]).toEqual([
      averyRow.held,
      averyRow.shows,
      averyRow.closes,
    ]);
  });
});

describe("filterDialsByPerson", () => {
  const dials = [
    { userName: "Sam Carter", id: 1 },
    { userName: "sam", id: 2 },
    { userName: "Samantha Lee", id: 3 },
    { userName: null, id: 4 },
    { userName: "  ", id: 5 },
  ];

  it("finds the person's dials with the same name merging", () => {
    expect(filterDialsByPerson(dials, "Sam Carter").map((d) => d.id)).toEqual([1, 2]);
  });

  it("finds nothing for a name the dialler doesn't know", () => {
    expect(filterDialsByPerson(dials, "Riley Stone")).toEqual([]);
  });
});
