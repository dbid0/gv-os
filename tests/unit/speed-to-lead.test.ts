import { describe, expect, it } from "vitest";

import {
  classifySpeedToLead,
  computeSpeedToLeadByRep,
  computeSpeedToLead,
  computeSpeedToLeadByClient,
  isSpeedToLeadOverdue,
  SPEED_TO_LEAD_SLA_SECONDS,
  summarizeSpeedToLead,
  type SpeedToLeadApp,
  type SpeedToLeadCall,
  type SpeedToLeadClassification,
  type SpeedToLeadClientApp,
  type SpeedToLeadClientCall,
} from "@/lib/funnel/speed-to-lead";

const T0 = 1_700_000_000_000; // arbitrary fixed epoch ms
const min = (n: number) => n * 60_000;

const app = (email: string | null, atMin: number): SpeedToLeadApp => ({
  email,
  submittedAtMs: T0 + min(atMin),
});
const call = (email: string | null, atMin: number): SpeedToLeadCall => ({
  email,
  occurredAtMs: T0 + min(atMin),
});

describe("computeSpeedToLead", () => {
  it("returns an all-zero, null-median shape when nothing matches", () => {
    const out = computeSpeedToLead([app("a@x.com", 0)], []);
    expect(out).toEqual({
      dialableApps: 1,
      matched: 0,
      medianMinutes: null,
      within5: 0,
      within20: 0,
      over60: 0,
      slaPct: null,
    });
  });

  it("measures minutes from application to the first dial", () => {
    const out = computeSpeedToLead([app("a@x.com", 0)], [call("a@x.com", 3)]);
    expect(out.matched).toBe(1);
    expect(out.medianMinutes).toBe(3);
    expect(out.within5).toBe(1);
    expect(out.slaPct).toBe(1);
  });

  it("buckets within 5 / 20 / over 60 minutes", () => {
    const out = computeSpeedToLead(
      [app("a@x.com", 0), app("b@x.com", 0), app("c@x.com", 0)],
      [call("a@x.com", 4), call("b@x.com", 18), call("c@x.com", 90)],
    );
    expect(out.matched).toBe(3);
    expect(out.within5).toBe(1);
    expect(out.within20).toBe(2); // 4 and 18 min both within 20
    expect(out.over60).toBe(1); // 90 min
    expect(out.slaPct).toBeCloseTo(1 / 3);
  });

  it("takes the earliest call per lead and matches emails case-insensitively", () => {
    const out = computeSpeedToLead(
      [app("Lead@X.com", 0)],
      [call("lead@x.com", 30), call("lead@x.com", 6)],
    );
    expect(out.medianMinutes).toBe(6);
  });

  it("ignores a call logged before the application", () => {
    const out = computeSpeedToLead([app("a@x.com", 10)], [call("a@x.com", 2)]);
    expect(out.matched).toBe(0);
  });

  it("excludes applications with no email from the dialable count", () => {
    const out = computeSpeedToLead(
      [app(null, 0), app("  ", 0), app("a@x.com", 0)],
      [call("a@x.com", 1)],
    );
    expect(out.dialableApps).toBe(1);
    expect(out.matched).toBe(1);
  });

  it("averages the two middle durations for an even sample", () => {
    const out = computeSpeedToLead(
      [app("a@x.com", 0), app("b@x.com", 0)],
      [call("a@x.com", 4), call("b@x.com", 8)],
    );
    expect(out.medianMinutes).toBe(6); // (4 + 8) / 2
  });
});

const capp = (
  clientId: string | null,
  clientName: string | null,
  email: string | null,
  atMin: number,
): SpeedToLeadClientApp => ({
  clientId,
  clientName,
  email,
  submittedAtMs: T0 + min(atMin),
});
const ccall = (
  clientId: string | null,
  clientName: string | null,
  email: string | null,
  atMin: number,
): SpeedToLeadClientCall => ({
  clientId,
  clientName,
  email,
  occurredAtMs: T0 + min(atMin),
});

describe("computeSpeedToLeadByClient", () => {
  it("returns no rows when there are no applications", () => {
    expect(computeSpeedToLeadByClient([], [ccall("g", "Grid", "x@x.com", 0)])).toEqual(
      [],
    );
  });

  it("computes one row per offer, matched only within that offer", () => {
    const out = computeSpeedToLeadByClient(
      [
        capp("g", "Grid", "a@x.com", 0),
        capp("g", "Grid", "b@x.com", 0),
        capp("v", "Vault", "c@x.com", 0),
      ],
      [
        ccall("g", "Grid", "a@x.com", 3), // within 5m
        ccall("g", "Grid", "b@x.com", 90), // over 60m
        ccall("v", "Vault", "c@x.com", 10),
        // A lead emailed under one offer but dialled under another must NOT match the first.
        ccall("v", "Vault", "a@x.com", 1),
      ],
    );
    expect(out.map((r) => r.clientName)).toEqual(["Grid", "Vault"]); // Grid has more matched
    const grid = out.find((r) => r.clientId === "g")!;
    expect(grid.dialableApps).toBe(2);
    expect(grid.matched).toBe(2);
    expect(grid.within5).toBe(1);
    expect(grid.over60).toBe(1);
    expect(grid.slaPct).toBeCloseTo(0.5);
    const vault = out.find((r) => r.clientId === "v")!;
    expect(vault.matched).toBe(1);
    expect(vault.medianMinutes).toBe(10);
  });

  it("drops applications with no offer", () => {
    const out = computeSpeedToLeadByClient(
      [capp(null, null, "a@x.com", 0), capp("g", "Grid", "b@x.com", 0)],
      [ccall("g", "Grid", "b@x.com", 2)],
    );
    expect(out).toHaveLength(1);
    expect(out[0].clientId).toBe("g");
  });

  it("buckets by normalized name when no client id is present", () => {
    const out = computeSpeedToLeadByClient(
      [capp(null, "Client North", "a@x.com", 0)],
      [ccall(null, "client north", "a@x.com", 4)],
    );
    expect(out).toHaveLength(1);
    expect(out[0].clientId).toBeNull();
    expect(out[0].clientName).toBe("Client North");
    expect(out[0].matched).toBe(1);
    expect(out[0].within5).toBe(1);
  });

  it("orders by matched, then dialable, then name", () => {
    const out = computeSpeedToLeadByClient(
      [
        capp("a", "Alpha", "a1@x.com", 0),
        capp("b", "Bravo", "b1@x.com", 0),
        capp("b", "Bravo", "b2@x.com", 0),
      ],
      [ccall("a", "Alpha", "a1@x.com", 2), ccall("b", "Bravo", "b1@x.com", 2)],
    );
    // Both have 1 matched; Bravo has more dialable apps, so it ranks first.
    expect(out.map((r) => r.clientName)).toEqual(["Bravo", "Alpha"]);
  });
});

describe("phone-fallback matching", () => {
  it("matches by phone when neither side carries an email", () => {
    // The floor that dials phone-only leads: without this, most of the day
    // is invisible to the flagship metric.
    const stats = computeSpeedToLead(
      [{ email: null, phone: "5550102030", submittedAtMs: 0 }],
      [{ email: null, phone: "5550102030", occurredAtMs: 4 * 60_000 }],
    );
    expect(stats.matched).toBe(1);
    expect(stats.within5).toBe(1);
  });

  it("email WINS over a conflicting phone match", () => {
    // Email is the stronger identity: the phone map might hold a household
    // number shared across leads.
    const stats = computeSpeedToLead(
      [{ email: "a@x.com", phone: "5550102030", submittedAtMs: 0 }],
      [
        { email: "a@x.com", phone: null, occurredAtMs: 3 * 60_000 },
        { email: null, phone: "5550102030", occurredAtMs: 60_000 },
      ],
    );
    // matched via email at 3m, NOT via the earlier phone-only dial
    expect(stats.matched).toBe(1);
    expect(stats.medianMinutes).toBe(3);
  });

  it("a phone-only app with no matching dial stays unmatched", () => {
    const stats = computeSpeedToLead(
      [{ email: null, phone: "5550102030", submittedAtMs: 0 }],
      [{ email: null, phone: "9990000000", occurredAtMs: 1000 }],
    );
    expect(stats.dialableApps).toBe(1);
    expect(stats.matched).toBe(0);
  });
});

describe("computeSpeedToLeadByRep", () => {
  const app = (email: string, at = 0) => ({ email, submittedAtMs: at });
  const call = (email: string, at: number, rep: string | null) => ({
    email,
    occurredAtMs: at,
    rep,
  });

  it("attributes each application to the rep who made the FIRST dial", () => {
    const rows = computeSpeedToLeadByRep(
      [app("a@x.com")],
      [
        call("a@x.com", 10 * 60_000, "Later Rep"),
        call("a@x.com", 3 * 60_000, "First Rep"),
      ],
    );
    expect(rows).toEqual([
      { rep: "First Rep", matched: 1, medianMinutes: 3, within5: 1, slaPct: 1 },
    ]);
  });

  it("merges case-variant rep names — one person, one row", () => {
    const rows = computeSpeedToLeadByRep(
      [app("a@x.com"), app("b@x.com")],
      [call("a@x.com", 60_000, "jordan rep"), call("b@x.com", 60_000, "Jordan Rep")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].matched).toBe(2);
  });

  it("a first dial with no rep lands under Unattributed, never vanishes", () => {
    const rows = computeSpeedToLeadByRep(
      [app("a@x.com")],
      [call("a@x.com", 1000, null)],
    );
    expect(rows[0].rep).toBe("Unattributed");
  });

  it("rep rows sum to the overall matched count", () => {
    const apps = [app("a@x.com"), app("b@x.com"), app("c@x.com")];
    const calls = [
      call("a@x.com", 60_000, "R1"),
      call("b@x.com", 60_000, "R2"),
      call("c@x.com", 60_000, "R1"),
    ];
    const overall = computeSpeedToLead(apps, calls);
    const byRep = computeSpeedToLeadByRep(apps, calls);
    expect(byRep.reduce((s, r) => s + r.matched, 0)).toBe(overall.matched);
  });
});

describe("classifySpeedToLead", () => {
  const NOW = T0 + min(60); // an hour after T0, used as "now" across this block

  it("returns nothing for an empty application list (no-application edge case)", () => {
    expect(classifySpeedToLead([], [call("a@x.com", 3)], NOW)).toEqual([]);
  });

  it("classifies WITHIN when contact lands at or inside the 5-minute SLA", () => {
    const [row] = classifySpeedToLead([app("a@x.com", 0)], [call("a@x.com", 5)], NOW);
    expect(row.status).toBe("within");
    expect(row.timeToContactSec).toBe(5 * 60);
    expect(row.waitingSec).toBeNull();
  });

  it("the SLA boundary itself (exactly 300s) counts as WITHIN, not breached", () => {
    const app0 = app("a@x.com", 0);
    const exactContact = {
      email: "a@x.com",
      occurredAtMs: T0 + SPEED_TO_LEAD_SLA_SECONDS * 1000,
    };
    const [row] = classifySpeedToLead([app0], [exactContact], NOW);
    expect(row.status).toBe("within");
    expect(row.timeToContactSec).toBe(SPEED_TO_LEAD_SLA_SECONDS);
  });

  it("classifies BREACHED when contact lands after the 5-minute SLA", () => {
    const [row] = classifySpeedToLead([app("a@x.com", 0)], [call("a@x.com", 12)], NOW);
    expect(row.status).toBe("breached");
    expect(row.timeToContactSec).toBe(12 * 60);
    expect(row.waitingSec).toBeNull();
  });

  it("classifies OPEN with no contact at all, and reports how long it has waited", () => {
    const [row] = classifySpeedToLead(
      [app("a@x.com", 0)],
      [],
      T0 + 90_000, // 90s after the application
    );
    expect(row.status).toBe("open");
    expect(row.timeToContactSec).toBeNull();
    expect(row.waitingSec).toBe(90);
  });

  it("an OPEN row not yet past the SLA is not an overdue breach", () => {
    const [row] = classifySpeedToLead([app("a@x.com", 0)], [], T0 + 90_000);
    expect(isSpeedToLeadOverdue(row)).toBe(false);
  });

  it("an OPEN row past the SLA IS a live breach — the overdue boundary is exclusive", () => {
    const atExactly300 = classifySpeedToLead(
      [app("a@x.com", 0)],
      [],
      T0 + SPEED_TO_LEAD_SLA_SECONDS * 1000,
    )[0];
    expect(isSpeedToLeadOverdue(atExactly300)).toBe(false); // exactly on the line: not yet overdue

    const atOneSecondPast = classifySpeedToLead(
      [app("a@x.com", 0)],
      [],
      T0 + SPEED_TO_LEAD_SLA_SECONDS * 1000 + 1000,
    )[0];
    expect(isSpeedToLeadOverdue(atOneSecondPast)).toBe(true);
    expect(atOneSecondPast.waitingSec).toBe(SPEED_TO_LEAD_SLA_SECONDS + 1);
  });

  it("a contact logged BEFORE the application reads as no valid contact — OPEN, not within", () => {
    // The only captured touch for this lead predates their application (e.g. a
    // stale dial from a previous, unrelated application). It must not be read
    // as a fast response to THIS application.
    const [row] = classifySpeedToLead(
      [app("a@x.com", 10)],
      [call("a@x.com", 2)],
      T0 + min(11),
    );
    expect(row.status).toBe("open");
    expect(row.timeToContactSec).toBeNull();
    expect(row.waitingSec).toBe(60); // 1 minute since the 10-minute-mark application
  });

  it("matches by phone when neither side carries an email", () => {
    const [row] = classifySpeedToLead(
      [{ email: null, phone: "5550102030", submittedAtMs: 0 }],
      [{ email: null, phone: "5550102030", occurredAtMs: 90_000 }],
      500_000,
    );
    expect(row.status).toBe("within");
    expect(row.timeToContactSec).toBe(90);
  });

  it("resolves an aliased email before matching", () => {
    const aliases = new Map([["alias@x.com", "canonical@x.com"]]);
    const [row] = classifySpeedToLead(
      [app("alias@x.com", 0)],
      [call("canonical@x.com", 2)],
      NOW,
      aliases,
    );
    expect(row.status).toBe("within");
  });

  it("an application with neither email nor phone stays OPEN forever, but is echoed through", () => {
    const [row] = classifySpeedToLead(
      [{ email: null, phone: null, submittedAtMs: T0 }],
      [call("a@x.com", 1)],
      NOW,
    );
    expect(row.status).toBe("open");
  });

  it("echoes the application's name straight through for display", () => {
    const [row] = classifySpeedToLead(
      [{ email: "a@x.com", name: "Jane Lead", submittedAtMs: T0 }],
      [],
      NOW,
    );
    expect(row.name).toBe("Jane Lead");
  });
});

describe("summarizeSpeedToLead", () => {
  it("returns an honest empty shape for no rows", () => {
    expect(summarizeSpeedToLead([])).toEqual({
      dialableApps: 0,
      within: 0,
      breached: 0,
      open: 0,
      overdueNow: 0,
      contactedSlaPct: null,
      medianContactSec: null,
    });
  });

  it("rolls up a mix of within / breached / open / overdue-open correctly", () => {
    const rows = classifySpeedToLead(
      [
        app("within@x.com", 0), // contacted at 3m -> within
        app("late@x.com", 0), // contacted at 20m -> breached
        app("waiting-ontime@x.com", 29), // applied 1 min before "now" -> open, not overdue
        app("waiting-overdue@x.com", 0), // applied 30 min before "now" -> open, overdue
      ],
      [call("within@x.com", 3), call("late@x.com", 20)],
      T0 + min(30),
    );
    // Sanity: this fixture actually produced the four states we intend to assert on.
    expect(rows.map((r) => r.status)).toEqual(["within", "breached", "open", "open"]);

    const summary = summarizeSpeedToLead(rows);
    expect(summary.dialableApps).toBe(4);
    expect(summary.within).toBe(1);
    expect(summary.breached).toBe(1);
    expect(summary.open).toBe(2);
    expect(summary.overdueNow).toBe(1); // only the 30-minute-waiting one is past the 5-min SLA
    expect(summary.contactedSlaPct).toBeCloseTo(1 / 2); // 1 within of 2 contacted
    expect(summary.medianContactSec).toBe((3 * 60 + 20 * 60) / 2);
  });

  it("excludes rows with neither email nor phone from every count", () => {
    const rows: SpeedToLeadClassification[] = [
      {
        email: null,
        phone: null,
        name: null,
        submittedAtMs: T0,
        status: "open",
        timeToContactSec: null,
        waitingSec: 10_000,
      },
    ];
    const summary = summarizeSpeedToLead(rows);
    expect(summary.dialableApps).toBe(0);
    expect(summary.open).toBe(0);
    expect(summary.overdueNow).toBe(0);
  });
});
