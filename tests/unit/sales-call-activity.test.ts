import { describe, expect, it } from "vitest";

import {
  ACTIVITY_MODES,
  ACTIVITY_MODE_KEYS,
  CALL_TYPES,
  CALL_TYPE_KEYS,
  DISPOSITIONS,
  DISPOSITION_KEYS,
  aggregateByRep,
  callTypeLabel,
  compareRepStats,
  dispositionDef,
  dispositionLabel,
  dispositionMetrics,
  summarizeActivity,
  type ActivityInput,
  type RepActivityStats,
} from "@/lib/sales/call-activity";

describe("activity modes", () => {
  it("offers exactly log-a-call and log-a-booking", () => {
    expect(ACTIVITY_MODE_KEYS).toEqual(["call", "booking"]);
    expect(ACTIVITY_MODES.find((m) => m.key === "call")?.label).toBe("Log a Call");
    expect(ACTIVITY_MODES.find((m) => m.key === "booking")?.label).toBe(
      "Log a Booking",
    );
  });
});

describe("disposition vocabulary", () => {
  it("carries the full RepVision disposition set with an outcome each", () => {
    expect(DISPOSITION_KEYS).toEqual([
      "sale_closed",
      "follow_up_booked",
      "rescheduled",
      "not_interested",
      "no_show",
      "dq",
      "wrong_number",
      "bad_lead",
    ]);
    for (const d of DISPOSITIONS) {
      expect(["won", "progress", "lost"]).toContain(d.outcome);
    }
  });

  it("looks a disposition up and falls back to the raw key when unknown", () => {
    expect(dispositionDef("sale_closed")?.label).toBe("Sale Closed");
    expect(dispositionDef("mystery")).toBeUndefined();
    expect(dispositionLabel("no_show")).toBe("No Show");
    expect(dispositionLabel("mystery")).toBe("mystery");
  });

  it("tags only a sale as won and dead ends as lost", () => {
    expect(dispositionDef("sale_closed")?.outcome).toBe("won");
    expect(dispositionDef("follow_up_booked")?.outcome).toBe("progress");
    expect(dispositionDef("rescheduled")?.outcome).toBe("progress");
    expect(dispositionDef("bad_lead")?.outcome).toBe("lost");
  });
});

describe("call types", () => {
  it("offers discovery, close, and follow-up", () => {
    expect(CALL_TYPE_KEYS).toEqual(["discovery", "close", "follow_up"]);
    expect(CALL_TYPES).toHaveLength(3);
  });

  it("labels a known type and falls back to the raw key otherwise", () => {
    expect(callTypeLabel("close")).toBe("Close");
    expect(callTypeLabel("follow_up")).toBe("Follow-up");
    expect(callTypeLabel("mystery")).toBe("mystery");
  });
});

describe("dispositionMetrics", () => {
  it("maps a closed sale to a show and a sale", () => {
    expect(dispositionMetrics("sale_closed")).toEqual({
      show: true,
      noShow: false,
      sale: true,
      followUp: false,
    });
  });

  it("maps a booked follow-up to a show and a follow-up", () => {
    expect(dispositionMetrics("follow_up_booked")).toEqual({
      show: true,
      noShow: false,
      sale: false,
      followUp: true,
    });
  });

  it("maps a no-show to a no-show and nothing else", () => {
    expect(dispositionMetrics("no_show")).toEqual({
      show: false,
      noShow: true,
      sale: false,
      followUp: false,
    });
  });

  it("counts not-interested and dq as shows that did not convert", () => {
    expect(dispositionMetrics("not_interested").show).toBe(true);
    expect(dispositionMetrics("not_interested").sale).toBe(false);
    expect(dispositionMetrics("dq").show).toBe(true);
  });

  it("treats a reschedule, wrong number, and bad lead as no on-call metrics", () => {
    for (const key of ["rescheduled", "wrong_number", "bad_lead"]) {
      expect(dispositionMetrics(key)).toEqual({
        show: false,
        noShow: false,
        sale: false,
        followUp: false,
      });
    }
  });

  it("returns no metrics for an unknown disposition", () => {
    expect(dispositionMetrics("mystery")).toEqual({
      show: false,
      noShow: false,
      sale: false,
      followUp: false,
    });
  });

  it("gives every known disposition a defined mapping", () => {
    for (const key of DISPOSITION_KEYS) {
      expect(dispositionMetrics(key)).toBeDefined();
    }
  });
});

describe("summarizeActivity", () => {
  it("returns an honest empty summary with null rates for no logs", () => {
    expect(summarizeActivity([])).toEqual({
      logged: 0,
      calls: 0,
      bookings: 0,
      shows: 0,
      noShows: 0,
      sales: 0,
      followUps: 0,
      showRate: null,
      closeRate: null,
    });
  });

  it("counts a booking as a booking, never a call or a show", () => {
    const logs: ActivityInput[] = [
      { repId: "r1", mode: "booking", disposition: "follow_up_booked" },
    ];
    const s = summarizeActivity(logs);
    expect(s.logged).toBe(1);
    expect(s.bookings).toBe(1);
    expect(s.calls).toBe(0);
    expect(s.shows).toBe(0);
    expect(s.showRate).toBeNull();
    expect(s.closeRate).toBeNull();
  });

  it("rolls calls into shows, sales, follow-ups, and no-shows", () => {
    const logs: ActivityInput[] = [
      { repId: "r1", mode: "call", disposition: "sale_closed" },
      { repId: "r1", mode: "call", disposition: "follow_up_booked" },
      { repId: "r1", mode: "call", disposition: "no_show" },
      { repId: "r1", mode: "booking", disposition: "follow_up_booked" },
    ];
    const s = summarizeActivity(logs);
    expect(s.logged).toBe(4);
    expect(s.calls).toBe(3);
    expect(s.bookings).toBe(1);
    expect(s.shows).toBe(2);
    expect(s.noShows).toBe(1);
    expect(s.sales).toBe(1);
    expect(s.followUps).toBe(1);
    // shows ÷ (shows + noShows) = 2 / 3
    expect(s.showRate).toBeCloseTo(2 / 3, 10);
    // sales ÷ shows = 1 / 2
    expect(s.closeRate).toBe(0.5);
  });

  it("keeps closeRate null when there were no shows but there were no-shows", () => {
    const s = summarizeActivity([
      { repId: "r1", mode: "call", disposition: "no_show" },
    ]);
    expect(s.showRate).toBe(0);
    expect(s.closeRate).toBeNull();
  });
});

describe("compareRepStats", () => {
  const base: RepActivityStats = {
    repId: "x",
    logged: 0,
    calls: 0,
    bookings: 0,
    shows: 0,
    noShows: 0,
    sales: 0,
    followUps: 0,
    showRate: null,
    closeRate: null,
  };

  it("ranks by sales first", () => {
    expect(compareRepStats({ ...base, sales: 5 }, { ...base, sales: 2 })).toBeLessThan(
      0,
    );
  });

  it("breaks a sales tie by shows", () => {
    expect(
      compareRepStats(
        { ...base, sales: 3, shows: 10 },
        { ...base, sales: 3, shows: 4 },
      ),
    ).toBeLessThan(0);
  });

  it("breaks a sales-and-shows tie by total logged", () => {
    expect(
      compareRepStats(
        { ...base, sales: 3, shows: 5, logged: 20 },
        { ...base, sales: 3, shows: 5, logged: 9 },
      ),
    ).toBeLessThan(0);
  });

  it("returns 0 when every tie-break is equal", () => {
    expect(
      compareRepStats(
        { ...base, sales: 3, shows: 5, logged: 9 },
        { ...base, sales: 3, shows: 5, logged: 9 },
      ),
    ).toBe(0);
  });
});

describe("aggregateByRep", () => {
  it("groups by rep, skips unassigned logs, and ranks", () => {
    const logs: ActivityInput[] = [
      { repId: "r1", mode: "call", disposition: "sale_closed" },
      { repId: "r1", mode: "call", disposition: "not_interested" },
      { repId: "r2", mode: "call", disposition: "sale_closed" },
      { repId: "r2", mode: "call", disposition: "sale_closed" },
      { repId: null, mode: "call", disposition: "sale_closed" },
      { repId: "r2", mode: "booking", disposition: "follow_up_booked" },
    ];
    const ranked = aggregateByRep(logs);

    // Two reps only — the unassigned log never rolls up.
    expect(ranked.map((r) => r.repId)).toEqual(["r2", "r1"]);

    const r2 = ranked[0];
    expect(r2.logged).toBe(3);
    expect(r2.calls).toBe(2);
    expect(r2.bookings).toBe(1);
    expect(r2.sales).toBe(2);

    const r1 = ranked[1];
    expect(r1.logged).toBe(2);
    expect(r1.calls).toBe(2);
    expect(r1.sales).toBe(1);
    expect(r1.shows).toBe(2);
    expect(r1.closeRate).toBe(0.5);
  });

  it("returns nothing when every log is unassigned", () => {
    expect(
      aggregateByRep([{ repId: null, mode: "call", disposition: "sale_closed" }]),
    ).toEqual([]);
  });
});
