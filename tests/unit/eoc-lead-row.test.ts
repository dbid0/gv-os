import { describe, expect, it } from "vitest";

import { APP_EOC_ROW_BASE, eocAsLeadRow } from "@/lib/calls/eoc-form";
import { buildLeadSummaries, type LeadEventInput } from "@/lib/tracking/leads";
import { pipelineStageOf } from "@/lib/tracking/pipeline-stage";

const at = new Date("2026-09-12T15:00:00Z");

const filed = {
  leadEmail: "lead@example.com",
  outcome: "closed",
  callAt: at,
  closerName: "Closer One",
  cashCollectedCents: 150_000,
  contractValueCents: 450_000,
  recordingUrl: "https://fathom.video/share/abc",
  notes: "Split pay, second half in 30 days.",
  closeType: "split",
};

function sheetRow(extra: Partial<LeadEventInput>): LeadEventInput {
  return {
    tab: "applications",
    rowIndex: 3,
    occurredAt: new Date("2026-09-08T10:00:00Z"),
    email: "lead@example.com",
    name: "Lead Person",
    rep: null,
    status: null,
    outcome: null,
    cashCents: null,
    revenueCents: null,
    recordingUrl: null,
    notes: null,
    payload: {},
    ...extra,
  };
}

describe("eocAsLeadRow", () => {
  it("writes a filed report as an eoc-tab lead event in the sheet's words", () => {
    expect(eocAsLeadRow(filed, 2)).toEqual({
      tab: "eoc",
      rowIndex: APP_EOC_ROW_BASE + 2,
      occurredAt: at,
      email: "lead@example.com",
      name: null,
      rep: "Closer One",
      status: "closed won",
      outcome: null,
      cashCents: 150_000,
      revenueCents: 450_000,
      recordingUrl: "https://fathom.video/share/abc",
      notes: "Split pay, second half in 30 days.",
      payload: { Source: "Filed in GV OS", "Close Type": "Split pay" },
    });
  });

  it("omits the close type when there is none and keeps an unknown outcome word", () => {
    const row = eocAsLeadRow(
      { ...filed, outcome: "mystery", closeType: null, closerName: null },
      0,
    );
    expect(row.payload).toEqual({ Source: "Filed in GV OS" });
    expect(row.status).toBe("mystery");
    expect(row.rep).toBeNull();
  });

  it("counts in the lead journey exactly like a sheet report", () => {
    const [lead] = buildLeadSummaries([
      sheetRow({}),
      eocAsLeadRow({ ...filed, outcome: "no_show", closeType: null }, 0),
    ]);
    expect(lead).toMatchObject({
      email: "lead@example.com",
      name: "Lead Person",
      applied: true,
      eocReports: 1,
      recordings: 1,
      latestStatus: "no show",
      reps: ["Closer One"],
    });
    expect(pipelineStageOf(lead)).toBe("called");
    // The filed event sorts after the application: stage first, then time.
    expect(lead.events.map((e) => e.tab)).toEqual(["applications", "eoc"]);
  });
});
