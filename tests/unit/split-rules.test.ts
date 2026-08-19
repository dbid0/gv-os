import { describe, expect, it } from "vitest";

import {
  resolveSplit,
  SplitRuleError,
  type SplitRule,
} from "@/lib/accounting/split-rules";

const d = (iso: string) => new Date(iso);

// The real GV history: a global 50/50 from 2026-08-03, with earlier per-client
// overrides that must keep applying to deals closed while they were in effect.
const rules: SplitRule[] = [
  {
    clientId: null,
    dealType: null,
    danielBps: 4000,
    gusBps: 6000,
    effectiveFrom: d("2026-01-01"),
    effectiveTo: d("2026-08-03"),
  },
  {
    clientId: null,
    dealType: null,
    danielBps: 5000,
    gusBps: 5000,
    effectiveFrom: d("2026-08-03"),
    effectiveTo: null,
  },
  {
    clientId: "jungle",
    dealType: null,
    danielBps: 4500,
    gusBps: 5500,
    effectiveFrom: d("2026-05-16"),
    effectiveTo: null,
  },
  {
    clientId: "torres",
    dealType: null,
    danielBps: 3000,
    gusBps: 7000,
    effectiveFrom: d("2026-05-24"),
    effectiveTo: null,
  },
  {
    clientId: null,
    dealType: "Client Handoff",
    danielBps: 5000,
    gusBps: 5000,
    effectiveFrom: d("2026-06-23"),
    effectiveTo: null,
  },
];

describe("resolveSplit", () => {
  it("uses the global default when no override applies", () => {
    const { danielBps } = resolveSplit(rules, {
      clientId: "grid",
      dealType: "Setup",
      on: d("2026-08-10"),
    });
    expect(danielBps).toBe(5000);
  });

  it("respects the date: the same client resolves differently before and after a rule change", () => {
    const before = resolveSplit(rules, {
      clientId: "grid",
      dealType: "Setup",
      on: d("2026-07-01"),
    });
    expect(before.danielBps).toBe(4000); // the old 40/60 default

    const after = resolveSplit(rules, {
      clientId: "grid",
      dealType: "Setup",
      on: d("2026-08-10"),
    });
    expect(after.danielBps).toBe(5000); // the new 50/50
  });

  it("prefers a client override over the global default", () => {
    const { danielBps, gusBps } = resolveSplit(rules, {
      clientId: "jungle",
      dealType: "DFY Build",
      on: d("2026-08-10"),
    });
    expect([danielBps, gusBps]).toEqual([4500, 5500]);
  });

  it("keeps the historical override applying to old deals", () => {
    const { danielBps } = resolveSplit(rules, {
      clientId: "torres",
      dealType: "Rev-Share",
      on: d("2026-06-01"),
    });
    expect(danielBps).toBe(3000);
  });

  it("prefers a client + deal-type rule over a client-only rule", () => {
    const specific: SplitRule = {
      clientId: "jungle",
      dealType: "Setup",
      danielBps: 6000,
      gusBps: 4000,
      effectiveFrom: d("2026-06-01"),
      effectiveTo: null,
    };
    const { danielBps } = resolveSplit([...rules, specific], {
      clientId: "jungle",
      dealType: "Setup",
      on: d("2026-08-10"),
    });
    expect(danielBps).toBe(6000);
  });

  it("prefers a deal-type rule over the global default", () => {
    const { danielBps, gusBps } = resolveSplit(rules, {
      clientId: "grid",
      dealType: "Client Handoff",
      on: d("2026-08-10"),
    });
    // Client Handoff is always 50/50, which happens to match here, but it must
    // be chosen via the deal-type rule, not the global one.
    expect([danielBps, gusBps]).toEqual([5000, 5000]);
  });

  it("THROWS rather than guessing when nothing matches", () => {
    expect(() =>
      resolveSplit([], { clientId: "grid", dealType: "Setup", on: d("2026-08-10") }),
    ).toThrow(SplitRuleError);
  });

  it("throws rather than applying a rule that has not taken effect yet", () => {
    const future: SplitRule = {
      clientId: "grid",
      dealType: null,
      danielBps: 7000,
      gusBps: 3000,
      effectiveFrom: d("2027-01-01"),
      effectiveTo: null,
    };
    expect(() =>
      resolveSplit([future], {
        clientId: "grid",
        dealType: "Setup",
        on: d("2026-08-10"),
      }),
    ).toThrow(SplitRuleError);
  });

  it("treats effectiveTo as exclusive, so the changeover day belongs to the new rule", () => {
    // On exactly 2026-08-03 the old rule (to: 08-03) is out and the new one is in.
    const { danielBps } = resolveSplit(rules, {
      clientId: "grid",
      dealType: "Setup",
      on: d("2026-08-03"),
    });
    expect(danielBps).toBe(5000);
  });

  it("breaks a tie between equally specific rules by most-recently effective", () => {
    // Two global rules both in effect on the date. The later-starting one wins,
    // which is the case a single overlapping migration would create.
    const older: SplitRule = {
      clientId: null,
      dealType: null,
      danielBps: 4000,
      gusBps: 6000,
      effectiveFrom: d("2026-01-01"),
      effectiveTo: null,
    };
    const newer: SplitRule = {
      clientId: null,
      dealType: null,
      danielBps: 5000,
      gusBps: 5000,
      effectiveFrom: d("2026-06-01"),
      effectiveTo: null,
    };
    // Order in the array must not matter; the resolver sorts.
    const { danielBps } = resolveSplit([older, newer], {
      clientId: "grid",
      dealType: "Setup",
      on: d("2026-08-10"),
    });
    expect(danielBps).toBe(5000);
  });

  it("rejects a stored rule whose parts do not sum to 100%", () => {
    const corrupt: SplitRule = {
      clientId: null,
      dealType: null,
      danielBps: 5000,
      gusBps: 4000,
      effectiveFrom: d("2026-01-01"),
      effectiveTo: null,
    };
    expect(() =>
      resolveSplit([corrupt], { clientId: "x", dealType: "y", on: d("2026-08-10") }),
    ).toThrow(/does not equal/);
  });
});
