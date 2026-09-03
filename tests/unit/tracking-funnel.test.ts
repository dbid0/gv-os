import { describe, expect, it } from "vitest";

import { buildOfferFunnel, formatRate, stagesFor } from "@/lib/tracking/funnel";
import type { LeadSummary } from "@/lib/tracking/leads";

const lead = (over: Partial<LeadSummary> = {}): LeadSummary => ({
  email: `${Math.random()}@x.com`,
  name: null,
  reps: [],
  firstSeen: null,
  lastSeen: null,
  applied: false,
  callsBooked: 0,
  eocReports: 0,
  recordings: 0,
  deals: 0,
  paymentsCents: 0,
  latestStatus: null,
  events: [],
  ...over,
});

describe("stagesFor", () => {
  it("treats a filed EOC report as the call having been held", () => {
    expect([...stagesFor(lead({ eocReports: 1 }))]).toContain("held");
  });

  it("counts a lead with money as paid", () => {
    expect([...stagesFor(lead({ paymentsCents: 4900 }))]).toContain("paid");
  });

  it("gives an untouched lead no stages", () => {
    expect([...stagesFor(lead())]).toEqual([]);
  });
});

describe("buildOfferFunnel", () => {
  it("counts PEOPLE, not rows", () => {
    // One prospect with three EOC reports is one call held, not three.
    const f = buildOfferFunnel([lead({ applied: true, eocReports: 3 })]);
    expect(f.stages.find((s) => s.key === "held")!.leads).toBe(1);
  });

  it("measures a conversion only on people who reached the earlier stage", () => {
    const f = buildOfferFunnel([
      lead({ applied: true, callsBooked: 1 }),
      lead({ applied: true }),
      // A buyer who never applied — from a DM, a webinar, a referral.
      lead({ paymentsCents: 99700 }),
    ]);
    const step = f.steps.find((s) => s.from === "applied" && s.to === "booked")!;
    expect(step.eligible).toBe(2);
    expect(step.advanced).toBe(1);
    expect(step.rate).toBe(0.5);
  });

  it("NEVER reports a rate above 100%", () => {
    // The trap: 3 paid / 1 applied = 300% if you divide stage totals.
    const f = buildOfferFunnel([
      lead({ applied: true }),
      lead({ paymentsCents: 100 }),
      lead({ paymentsCents: 100 }),
      lead({ paymentsCents: 100 }),
    ]);
    for (const s of f.steps) {
      if (s.rate !== null) expect(s.rate).toBeLessThanOrEqual(1);
    }
  });

  it("reports an unknown rate as null, never as zero", () => {
    // No one applied, so "applied → booked" is unknowable. 0% would be a claim
    // that everyone who applied failed to book.
    const f = buildOfferFunnel([lead({ paymentsCents: 100 })]);
    expect(f.steps.find((s) => s.from === "applied")!.rate).toBeNull();
    expect(formatRate(null)).toBe("—");
  });

  it("counts leads who skipped a stage instead of hiding them", () => {
    const f = buildOfferFunnel([
      lead({ applied: true, callsBooked: 1, eocReports: 1 }),
      // Paid with no application, no booking, no EOC.
      lead({ paymentsCents: 4900 }),
    ]);
    expect(f.skipped).toBe(1);
  });

  it("does not call a lead who simply hasn't progressed a skip", () => {
    // Applied and booked, nothing since. That is a funnel in progress, not a gap.
    expect(buildOfferFunnel([lead({ applied: true, callsBooked: 1 })]).skipped).toBe(0);
  });

  it("does not call a clean journey a skip", () => {
    const f = buildOfferFunnel([
      lead({
        applied: true,
        callsBooked: 1,
        eocReports: 1,
        deals: 1,
        paymentsCents: 100,
      }),
    ]);
    expect(f.skipped).toBe(0);
  });

  it("handles an offer with no leads at all", () => {
    const f = buildOfferFunnel([]);
    expect(f.totalLeads).toBe(0);
    expect(f.stages.every((s) => s.leads === 0)).toBe(true);
    expect(f.steps.every((s) => s.rate === null)).toBe(true);
  });
});

describe("formatRate", () => {
  it("rounds to whole percent", () => {
    expect(formatRate(0.5)).toBe("50%");
    expect(formatRate(0.333)).toBe("33%");
    expect(formatRate(1)).toBe("100%");
  });
});
