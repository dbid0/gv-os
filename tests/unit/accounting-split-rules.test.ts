import { describe, expect, it } from "vitest";

import {
  resolvePartnerSplit,
  DEFAULT_SPLIT,
  type SplitRule,
} from "@/lib/accounting/split-rules";

const AT = new Date("2026-06-01T00:00:00Z");

function rule(partial: Partial<SplitRule>): SplitRule {
  return {
    clientId: null,
    dealType: null,
    danielBps: 5000,
    gusBps: 5000,
    effectiveFrom: new Date("2020-01-01T00:00:00Z"),
    effectiveTo: null,
    ...partial,
  };
}

describe("resolvePartnerSplit — the default", () => {
  it("returns 50/50 when no rules exist", () => {
    expect(
      resolvePartnerSplit([], { clientId: "c1", dealType: "Setup", at: AT }),
    ).toEqual(DEFAULT_SPLIT);
  });

  it("returns 50/50 when no rule matches the query", () => {
    const rules = [rule({ clientId: "other", danielBps: 3000, gusBps: 7000 })];
    expect(
      resolvePartnerSplit(rules, { clientId: "c1", dealType: "Setup", at: AT }),
    ).toEqual(DEFAULT_SPLIT);
  });
});

describe("resolvePartnerSplit — specificity", () => {
  it("a client+type rule beats a client-only rule beats a type-only rule beats the blanket", () => {
    const rules = [
      rule({ danielBps: 5000, gusBps: 5000 }), // blanket
      rule({ dealType: "Setup", danielBps: 4500, gusBps: 5500 }), // type only
      rule({ clientId: "c1", danielBps: 4000, gusBps: 6000 }), // client only
      rule({ clientId: "c1", dealType: "Setup", danielBps: 3000, gusBps: 7000 }), // both
    ];
    expect(
      resolvePartnerSplit(rules, { clientId: "c1", dealType: "Setup", at: AT }),
    ).toEqual({ danielBps: 3000, gusBps: 7000 });
  });

  it("falls to the client-only rule when no client+type rule matches", () => {
    const rules = [
      rule({ danielBps: 5000, gusBps: 5000 }),
      rule({ clientId: "c1", danielBps: 4000, gusBps: 6000 }),
    ];
    expect(
      resolvePartnerSplit(rules, { clientId: "c1", dealType: "DFY Build", at: AT }),
    ).toEqual({ danielBps: 4000, gusBps: 6000 });
  });

  it("matches deal type case-insensitively", () => {
    const rules = [rule({ dealType: "client handoff", danielBps: 5000, gusBps: 5000 })];
    expect(
      resolvePartnerSplit(rules, {
        clientId: "c1",
        dealType: "Client Handoff",
        at: AT,
      }),
    ).toEqual({ danielBps: 5000, gusBps: 5000 });
  });

  it("excludes a rule whose deal type does not match the query", () => {
    const rules = [rule({ dealType: "Rev-Share", danielBps: 3000, gusBps: 7000 })];
    expect(
      resolvePartnerSplit(rules, { clientId: "c1", dealType: "Setup", at: AT }),
    ).toEqual(DEFAULT_SPLIT);
  });
});

describe("resolvePartnerSplit — effective dating", () => {
  it("ignores a rule that has not taken effect yet", () => {
    const rules = [
      rule({
        clientId: "c1",
        danielBps: 3000,
        gusBps: 7000,
        effectiveFrom: new Date("2026-07-01T00:00:00Z"),
      }),
    ];
    expect(
      resolvePartnerSplit(rules, { clientId: "c1", dealType: "Setup", at: AT }),
    ).toEqual(DEFAULT_SPLIT);
  });

  it("ignores a rule that has already ended", () => {
    const rules = [
      rule({
        clientId: "c1",
        danielBps: 3000,
        gusBps: 7000,
        effectiveTo: new Date("2026-05-01T00:00:00Z"),
      }),
    ];
    expect(
      resolvePartnerSplit(rules, { clientId: "c1", dealType: "Setup", at: AT }),
    ).toEqual(DEFAULT_SPLIT);
  });

  it("returns the rule that was in force at the asked-for date, not the newest", () => {
    const rules = [
      rule({
        clientId: "c1",
        danielBps: 4500,
        gusBps: 5500,
        effectiveFrom: new Date("2025-01-01T00:00:00Z"),
        effectiveTo: new Date("2026-01-01T00:00:00Z"),
      }),
      rule({
        clientId: "c1",
        danielBps: 5000,
        gusBps: 5000,
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      }),
    ];
    const past = resolvePartnerSplit(rules, {
      clientId: "c1",
      dealType: "Setup",
      at: new Date("2025-06-01T00:00:00Z"),
    });
    expect(past).toEqual({ danielBps: 4500, gusBps: 5500 });
  });

  it("on equal specificity, the most recently effective rule wins", () => {
    const rules = [
      rule({
        clientId: "c1",
        danielBps: 4500,
        gusBps: 5500,
        effectiveFrom: new Date("2025-01-01T00:00:00Z"),
      }),
      rule({
        clientId: "c1",
        danielBps: 4000,
        gusBps: 6000,
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      }),
    ];
    expect(
      resolvePartnerSplit(rules, { clientId: "c1", dealType: "Setup", at: AT }),
    ).toEqual({
      danielBps: 4000,
      gusBps: 6000,
    });
  });
});

describe("resolvePartnerSplit — malformed rules fail loud", () => {
  it("throws if the chosen rule does not sum to 100%", () => {
    const rules = [rule({ clientId: "c1", danielBps: 4000, gusBps: 5000 })];
    expect(() =>
      resolvePartnerSplit(rules, { clientId: "c1", dealType: "Setup", at: AT }),
    ).toThrow(/does not sum to 100%/);
  });
});
