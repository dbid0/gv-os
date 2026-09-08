import { describe, expect, it } from "vitest";

import { stuckCalls, type StuckCandidate } from "@/lib/bookings/stuck";

const NOW = new Date("2026-09-08T18:00:00Z");
const booking = (over: Partial<StuckCandidate>): StuckCandidate => ({
  inviteeName: "Lead",
  inviteeEmail: "lead@x.com",
  startsAt: new Date("2026-09-08T12:00:00Z"),
  status: "booked",
  ...over,
});

describe("stuckCalls", () => {
  it("a passed, uncancelled, unreported call is stuck", () => {
    const out = stuckCalls([booking({})], new Set(), NOW);
    expect(out).toHaveLength(1);
    expect(out[0].hoursOverdue).toBe(6);
  });

  it("an end-of-call report on file clears it", () => {
    expect(stuckCalls([booking({})], new Set(["lead@x.com"]), NOW)).toHaveLength(0);
  });

  it("a cancelled call is not stuck — someone said what happened", () => {
    expect(stuckCalls([booking({ status: "canceled" })], new Set(), NOW)).toHaveLength(
      0,
    );
  });

  it("a call inside the one-hour grace is not nagged", () => {
    const justEnded = booking({ startsAt: new Date("2026-09-08T17:30:00Z") });
    expect(stuckCalls([justEnded], new Set(), NOW)).toHaveLength(0);
  });

  it("a future call is not stuck", () => {
    const future = booking({ startsAt: new Date("2026-09-09T12:00:00Z") });
    expect(stuckCalls([future], new Set(), NOW)).toHaveLength(0);
  });

  it("ancient history stays out of the ops tile", () => {
    const old = booking({ startsAt: new Date("2026-08-01T12:00:00Z") });
    expect(stuckCalls([old], new Set(), NOW)).toHaveLength(0);
  });

  it("oldest stuck first — the biggest hole leads", () => {
    const a = booking({
      inviteeEmail: "a@x.com",
      startsAt: new Date("2026-09-08T10:00:00Z"),
    });
    const b = booking({
      inviteeEmail: "b@x.com",
      startsAt: new Date("2026-09-07T10:00:00Z"),
    });
    const out = stuckCalls([a, b], new Set(), NOW);
    expect(out[0].inviteeEmail).toBe("b@x.com");
  });
});
