import { describe, expect, it } from "vitest";

import { computeFunnel, ratePct, type RepFunnelInput } from "@/lib/sales/funnel";

describe("ratePct", () => {
  it("computes a whole percent, or null with no denominator", () => {
    expect(ratePct(19, 25)).toBe(76);
    expect(ratePct(1, 3)).toBe(33);
    expect(ratePct(5, 0)).toBeNull();
    expect(ratePct(0, 0)).toBeNull();
  });
});

describe("computeFunnel", () => {
  const reps: RepFunnelInput[] = [
    {
      repId: "r1",
      name: "Alpha",
      teamName: "The Grid",
      setsBooked: 40,
      shows: 25,
      deals: 10,
    },
    {
      repId: "r2",
      name: "Beta",
      teamName: "The Vault",
      setsBooked: 20,
      shows: 10,
      deals: 2,
    },
    { repId: "r3", name: "Idle", teamName: null, setsBooked: 0, shows: 0, deals: 0 },
  ];

  it("aggregates the team funnel and its rates", () => {
    const f = computeFunnel(reps);
    expect(f.setsBooked).toBe(60);
    expect(f.shows).toBe(35);
    expect(f.deals).toBe(12);
    expect(f.showRatePct).toBe(58); // 35/60
    expect(f.closeRatePct).toBe(34); // 12/35
    expect(f.setToCloseRatePct).toBe(20); // 12/60
  });

  it("computes per-rep rates and drops reps with no funnel activity", () => {
    const f = computeFunnel(reps);
    expect(f.reps.map((r) => r.repId)).toEqual(["r1", "r2"]); // r3 dropped
    const r1 = f.reps[0];
    expect(r1.showRatePct).toBe(63); // 25/40
    expect(r1.closeRatePct).toBe(40); // 10/25
    expect(r1.setToCloseRatePct).toBe(25); // 10/40
  });

  it("never invents a rate: null (em dash) when a stage has no denominator", () => {
    const f = computeFunnel([
      { repId: "x", name: "New", teamName: null, setsBooked: 5, shows: 0, deals: 0 },
    ]);
    expect(f.reps[0].showRatePct).toBe(0); // 0 shows of 5 sets = a real 0%
    expect(f.reps[0].closeRatePct).toBeNull(); // no shows -> no close rate
  });

  it("is all-zero and empty on no input", () => {
    const f = computeFunnel([]);
    expect(f).toMatchObject({ setsBooked: 0, shows: 0, deals: 0, reps: [] });
    expect(f.closeRatePct).toBeNull();
  });
});
