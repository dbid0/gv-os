import { describe, expect, it } from "vitest";

import {
  activityRates,
  canonicalRepNames,
  editDistanceWithin,
  nearDuplicateRepNames,
  aggregateActivity,
  floorTotals,
  rate,
  readCount,
  readEodMetrics,
} from "@/lib/tracking/activity";

// Payloads copied from live rows on Client North's sheet.
const SETTER = {
  Date: "2026-09-01",
  Dials: "4",
  Notes: "Terrible day",
  "DQ Leads": "0",
  Reschedules: "1",
  "Setter Name": "Sam",
  "Calls Showed": "0",
  "Deals Closed": "0",
  "Contacts Made": "0",
  "New Appts Set": "2",
  "Cash Collected": "0",
  "Calls on Calendar": "2",
};
const CLOSER = {
  Date: "2026-09-04",
  Deposits: "0",
  "Closer Name": "jordan rivers",
  "Offers Made": "3",
  "Calls Showed": "4",
  "Deals Closed": "0",
  "Outbound Dials": "4",
  "Available Slots": "8",
  "Calls on Calendar": "5",
};
const DM_SETTER = {
  Date: "2026-09-03",
  "# Calls Booked": "1",
  "# Calls Showed": "2",
  "# Deals Closed": "1",
  "Cash Collected": "Still in process",
  "# Calls Pitched": "3",
  "No-Shows Rebooked": "0",
  "# Calls On Calendar": "2",
};

describe("readCount", () => {
  it("reads a plain count", () => {
    expect(readCount("4")).toBe(4);
    expect(readCount(" 12 ")).toBe(12);
    expect(readCount("1,200")).toBe(1200);
    expect(readCount("0")).toBe(0);
  });

  it("returns null for the prose reps type into number fields", () => {
    // Live row: "Cash Collected = Still in process". Unknown must not be
    // added to a total as zero.
    expect(readCount("Still in process")).toBeNull();
    expect(readCount("")).toBeNull();
    expect(readCount(undefined)).toBeNull();
    expect(readCount("-3")).toBeNull();
  });
});

describe("readEodMetrics", () => {
  it("reads the SETTER form", () => {
    const m = readEodMetrics(SETTER);
    expect(m.dials).toBe(4);
    expect(m.apptsSet).toBe(2);
    expect(m.onCalendar).toBe(2);
    expect(m.contacts).toBe(0);
  });

  it("reads the CLOSER form, whose dials are 'Outbound Dials'", () => {
    const m = readEodMetrics(CLOSER);
    expect(m.dials).toBe(4);
    expect(m.offersMade).toBe(3);
    expect(m.showed).toBe(4);
    expect(m.availableSlots).toBe(8);
  });

  it("reads the DM SETTER form, whose columns are prefixed with #", () => {
    const m = readEodMetrics(DM_SETTER);
    expect(m.pitched).toBe(3);
    expect(m.apptsSet).toBe(1);
    expect(m.showed).toBe(2);
    expect(m.dealsClosed).toBe(1);
  });

  it("leaves a metric ABSENT when the form does not ask for it", () => {
    // Absent and zero are different claims: the DM form has no dials field.
    expect(readEodMetrics(DM_SETTER).dials).toBeUndefined();
    expect(readEodMetrics(SETTER).offersMade).toBeUndefined();
  });

  it("leaves a metric absent when the cell holds prose", () => {
    expect(readEodMetrics({ Dials: "loads" }).dials).toBeUndefined();
  });
});

describe("aggregateActivity", () => {
  it("sums a rep's days", () => {
    const [rep] = aggregateActivity([
      { rep: "Sam", payload: SETTER },
      { rep: "Sam", payload: { ...SETTER, Dials: "10", "New Appts Set": "3" } },
    ]);
    expect(rep.days).toBe(2);
    expect(rep.totals.dials).toBe(14);
    expect(rep.totals.apptsSet).toBe(5);
  });

  it("collapses a rep whose name drifts", () => {
    // Live data: "Sam", "Sam Carter", "sam carter" on the same tab. Left apart,
    // one person's dials split across three rows.
    const reps = aggregateActivity([
      { rep: "Sam", payload: SETTER },
      { rep: "sam carter", payload: SETTER },
      { rep: "Sam Carter", payload: SETTER },
    ]);
    expect(reps).toHaveLength(1);
    expect(reps[0].days).toBe(3);
    expect(reps[0].totals.dials).toBe(12);
  });

  it("REFUSES to merge an ambiguous first name", () => {
    // A floor with two Ethans: a bare "Ethan" could be either, so it stays on
    // its own rather than crediting one rep with another's dials.
    const reps = aggregateActivity([
      { rep: "Ethan Morgan", payload: { Dials: "10" } },
      { rep: "Ethan Cole", payload: { Dials: "20" } },
      { rep: "Ethan", payload: { Dials: "5" } },
    ]);
    expect(reps).toHaveLength(3);
    expect(reps.find((r) => r.rep === "Ethan Morgan")!.totals.dials).toBe(10);
    expect(reps.find((r) => r.rep === "Ethan")!.totals.dials).toBe(5);
  });

  it("does not merge two people who merely share a word", () => {
    const reps = aggregateActivity([
      { rep: "Alex Smith", payload: { Dials: "3" } },
      { rep: "Sam Smith", payload: { Dials: "4" } },
    ]);
    expect(reps).toHaveLength(2);
  });

  it("skips rows with no rep — they cannot be attributed", () => {
    expect(aggregateActivity([{ rep: null, payload: SETTER }])).toEqual([]);
    expect(aggregateActivity([{ rep: "  ", payload: SETTER }])).toEqual([]);
  });

  it("orders by dials, the number a floor is run on", () => {
    const reps = aggregateActivity([
      { rep: "Quiet", payload: { Dials: "2" } },
      { rep: "Busy", payload: { Dials: "40" } },
    ]);
    expect(reps.map((r) => r.rep)).toEqual(["Busy", "Quiet"]);
  });
});

describe("floorTotals", () => {
  it("adds every rep together", () => {
    const totals = floorTotals(
      aggregateActivity([
        { rep: "A", payload: SETTER },
        { rep: "B", payload: CLOSER },
      ]),
    );
    expect(totals.dials).toBe(8);
    expect(totals.onCalendar).toBe(7);
  });

  it("is empty for an empty floor", () => {
    expect(floorTotals([])).toEqual({});
  });
});

describe("rate / activityRates", () => {
  it("computes the rates a manager reads", () => {
    const r = activityRates({
      dials: 100,
      contacts: 25,
      onCalendar: 10,
      showed: 6,
      offersMade: 5,
      dealsClosed: 3,
    });
    expect(r.contact).toBeCloseTo(0.25);
    expect(r.show).toBeCloseTo(0.6);
    expect(r.offer).toBeCloseTo(5 / 6);
    expect(r.close).toBeCloseTo(0.5);
  });

  it("is null, never 0%, when nothing was reported", () => {
    // 0% would claim every dial failed rather than admitting nobody dialled.
    expect(rate(0, 0)).toBeNull();
    expect(rate(5, undefined)).toBeNull();
    expect(rate(undefined, 10)).toBeNull();
    const r = activityRates({});
    expect(r.contact).toBeNull();
    expect(r.close).toBeNull();
  });

  it("still reports a real zero rate", () => {
    // Nobody closed out of 6 shown calls IS 0%, and that is worth seeing.
    expect(activityRates({ showed: 6, dealsClosed: 0 }).close).toBe(0);
  });
});

describe("canonicalRepNames", () => {
  it("folds a first name into the one full name it can mean", () => {
    const map = canonicalRepNames(["Sam", "Sam Carter"]);
    expect(map.get("sam")).toBe("Sam Carter");
  });

  it("leaves an ambiguous first name alone", () => {
    const map = canonicalRepNames(["Ethan", "Ethan Morgan", "Ethan Cole"]);
    expect(map.get("ethan")).toBe("Ethan");
  });

  it("never folds a longer name into a shorter one", () => {
    const map = canonicalRepNames(["Sam", "Sam Carter"]);
    expect(map.get("sam carter")).toBe("Sam Carter");
  });

  it("shows the capitalised spelling whichever order the rows arrive in", () => {
    for (const names of [
      ["sam carter", "SAM carter", "Sam Carter", "SAM CARTER"],
      ["Sam Carter", "sam carter"],
    ]) {
      expect(canonicalRepNames(names).get("sam carter")).toBe("Sam Carter");
    }
    expect(canonicalRepNames(["sam", "Sam Carter"]).get("sam")).toBe("Sam Carter");
  });

  it("ignores blanks", () => {
    expect(canonicalRepNames(["", "   "]).size).toBe(0);
  });
});

describe("nearDuplicateRepNames", () => {
  it("spots the one-letter typo on the live sheet", () => {
    // "Ethan morgen" and "Ethan Morgan" are both on Client North's EOD tabs.
    const pairs = nearDuplicateRepNames(["Ethan morgen", "Ethan Morgan", "Sam Carter"]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toContain("Ethan morgen");
  });

  it("does NOT report names that only differ in case — those already merge", () => {
    expect(nearDuplicateRepNames(["Sam Carter", "sam carter"])).toEqual([]);
  });

  it("reports one typo ONCE, not once per case variant", () => {
    // Live data holds "Ethan Morgan", "ethan morgan" and "Ethan morgen". The
    // first two are already one rep; only the typo is worth reporting.
    const pairs = nearDuplicateRepNames([
      "Ethan Morgan",
      "ethan morgan",
      "Ethan morgen",
    ]);
    expect(pairs).toHaveLength(1);
  });

  it("does not report two genuinely different reps", () => {
    expect(nearDuplicateRepNames(["Ethan Morgan", "Ethan Cole"])).toEqual([]);
    expect(nearDuplicateRepNames(["Sam Carter", "Jordan Rivers"])).toEqual([]);
  });

  it("is empty for a clean roster", () => {
    expect(nearDuplicateRepNames(["A Rep"])).toEqual([]);
    expect(nearDuplicateRepNames([])).toEqual([]);
  });
});

describe("editDistanceWithin", () => {
  it("counts a substitution, an insertion and a deletion as one edit", () => {
    expect(editDistanceWithin("barron", "baron", 1)).toBe(true);
    expect(editDistanceWithin("sam", "samm", 1)).toBe(true);
    expect(editDistanceWithin("kate", "kats", 1)).toBe(true);
  });

  it("rejects anything further apart", () => {
    expect(editDistanceWithin("barron", "brn", 1)).toBe(false);
    expect(editDistanceWithin("jordan", "ethan", 1)).toBe(false);
  });

  it("treats identical strings as within any budget", () => {
    expect(editDistanceWithin("same", "same", 0)).toBe(true);
  });
});
