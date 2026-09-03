import { describe, expect, it } from "vitest";

import {
  buildLeadSummaries,
  isLeadTab,
  searchLeads,
  type LeadEventInput,
} from "@/lib/tracking/leads";

const ev = (over: Partial<LeadEventInput> & { tab: string }): LeadEventInput => ({
  rowIndex: 2,
  occurredAt: null,
  email: "lead@example.com",
  name: null,
  rep: null,
  status: null,
  outcome: null,
  cashCents: null,
  revenueCents: null,
  recordingUrl: null,
  notes: null,
  payload: {},
  ...over,
});

const d = (iso: string) => new Date(iso);

describe("isLeadTab", () => {
  it("accepts the tabs that identify a lead", () => {
    expect(isLeadTab("applications")).toBe(true);
    expect(isLeadTab("eoc")).toBe(true);
    expect(isLeadTab("payments")).toBe(true);
  });

  it("EXCLUDES the rep-level tabs", () => {
    // BOD and the EODs describe a rep's day and carry no lead email. Folding
    // them in would attach a setter's dial count to a prospect.
    expect(isLeadTab("bod")).toBe(false);
    expect(isLeadTab("setter_eod")).toBe(false);
    expect(isLeadTab("closer_eod")).toBe(false);
  });
});

describe("buildLeadSummaries", () => {
  it("stitches one lead's journey across tabs", () => {
    const leads = buildLeadSummaries([
      ev({
        tab: "applications",
        occurredAt: d("2026-08-01T10:00:00Z"),
        name: "Julian",
      }),
      ev({ tab: "calls", occurredAt: d("2026-08-03T15:00:00Z"), rep: "Lorenzo" }),
      ev({
        tab: "eoc",
        occurredAt: d("2026-08-03T16:00:00Z"),
        rep: "Lorenzo",
        status: "Follow Up — Strong Interest",
        recordingUrl: "https://fathom.video/share/x",
      }),
      ev({ tab: "payments", occurredAt: d("2026-08-05T12:00:00Z"), cashCents: 99700 }),
    ]);

    expect(leads).toHaveLength(1);
    const lead = leads[0];
    expect(lead.applied).toBe(true);
    expect(lead.callsBooked).toBe(1);
    expect(lead.eocReports).toBe(1);
    expect(lead.recordings).toBe(1);
    expect(lead.paymentsCents).toBe(99700);
    expect(lead.latestStatus).toBe("Follow Up — Strong Interest");
    expect(lead.events.map((e) => e.tab)).toEqual([
      "applications",
      "calls",
      "eoc",
      "payments",
    ]);
  });

  it("counts the Payment Log only, so one sale is not counted twice", () => {
    // The sheet restates the same $997 on the New Deals row and the Payment
    // Log row. Summing both would report twice what came in.
    const leads = buildLeadSummaries([
      ev({ tab: "deals", cashCents: 99700, occurredAt: d("2026-08-05T10:00:00Z") }),
      ev({ tab: "payments", cashCents: 99700, occurredAt: d("2026-08-05T11:00:00Z") }),
    ]);
    expect(leads[0].paymentsCents).toBe(99700);
  });

  it("keeps two different people apart and merges one person's rows", () => {
    const leads = buildLeadSummaries([
      ev({ tab: "applications", email: "a@x.com" }),
      ev({ tab: "eoc", email: "a@x.com" }),
      ev({ tab: "applications", email: "b@x.com" }),
    ]);
    expect(leads).toHaveLength(2);
    expect(leads.find((l) => l.email === "a@x.com")!.events).toHaveLength(2);
  });

  it("prefers the fullest spelling of a hand-typed name", () => {
    const leads = buildLeadSummaries([
      ev({ tab: "applications", name: "Julian" }),
      ev({ tab: "deals", name: "Julian Schiederer" }),
    ]);
    expect(leads[0].name).toBe("Julian Schiederer");
  });

  it("collapses a rep's name typed three different ways", () => {
    // Live data: "lorenzo saponara", "Lorenzo Saponara", "Lorenzo  Saponara".
    const leads = buildLeadSummaries([
      ev({ tab: "calls", rep: "lorenzo saponara" }),
      ev({ tab: "eoc", rep: "Lorenzo Saponara" }),
      ev({ tab: "deals", rep: "Lorenzo Saponara " }),
    ]);
    expect(leads[0].reps).toEqual(["lorenzo saponara"]);
  });

  it("never shows a payment above the call that was booked to win it", () => {
    // Live data: Hugues has a dated payment and an UNDATED booked call.
    // Sorting dated events first put the payment at the top of his journey.
    const leads = buildLeadSummaries([
      ev({ tab: "payments", occurredAt: d("2026-09-03T04:01:00Z"), cashCents: 4900 }),
      ev({ tab: "calls", occurredAt: null, rep: "Yel Akot" }),
    ]);
    expect(leads[0].events.map((e) => e.tab)).toEqual(["calls", "payments"]);
  });

  it("orders within a stage by real time", () => {
    const leads = buildLeadSummaries([
      ev({
        tab: "eoc",
        rowIndex: 9,
        occurredAt: d("2026-08-20T10:00:00Z"),
        status: "second",
      }),
      ev({
        tab: "eoc",
        rowIndex: 4,
        occurredAt: d("2026-08-05T10:00:00Z"),
        status: "first",
      }),
    ]);
    expect(leads[0].events.map((e) => e.status)).toEqual(["first", "second"]);
  });

  it("orders undated events by funnel stage instead of dropping them", () => {
    // The Grid's Calls Log is 94% undated; those rows still belong on the
    // timeline, in the only order that makes sense without a date.
    const leads = buildLeadSummaries([
      ev({ tab: "payments", rowIndex: 9 }),
      ev({ tab: "applications", rowIndex: 4 }),
      ev({ tab: "eoc", rowIndex: 7 }),
    ]);
    expect(leads[0].events.map((e) => e.tab)).toEqual([
      "applications",
      "eoc",
      "payments",
    ]);
  });

  it("ignores rows with no email — they cannot be attributed to anyone", () => {
    expect(buildLeadSummaries([ev({ tab: "calls", email: null })])).toEqual([]);
  });

  it("ignores rep-level tabs even when an email slipped into the row", () => {
    expect(buildLeadSummaries([ev({ tab: "closer_eod", email: "rep@x.com" })])).toEqual(
      [],
    );
  });

  it("sorts leads by most recent activity", () => {
    const leads = buildLeadSummaries([
      ev({
        tab: "applications",
        email: "old@x.com",
        occurredAt: d("2026-07-01T00:00:00Z"),
      }),
      ev({
        tab: "applications",
        email: "new@x.com",
        occurredAt: d("2026-08-20T00:00:00Z"),
      }),
    ]);
    expect(leads.map((l) => l.email)).toEqual(["new@x.com", "old@x.com"]);
  });
});

describe("searchLeads", () => {
  const leads = buildLeadSummaries([
    ev({ tab: "applications", email: "julian@mail.com", name: "Julian Schiederer" }),
    ev({ tab: "eoc", email: "other@mail.com", rep: "Lorenzo Saponara" }),
  ]);

  it("finds by email, name or rep", () => {
    expect(searchLeads(leads, "julian")).toHaveLength(1);
    expect(searchLeads(leads, "schieder")).toHaveLength(1);
    expect(searchLeads(leads, "lorenzo")).toHaveLength(1);
  });

  it("returns everything for an empty query and nothing for a miss", () => {
    expect(searchLeads(leads, "  ")).toHaveLength(2);
    expect(searchLeads(leads, "nobody")).toHaveLength(0);
  });
});
