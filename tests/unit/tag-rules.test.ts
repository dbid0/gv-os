import { describe, expect, it } from "vitest";

import {
  classifyPayment,
  ruleMatches,
  type TaggablePayment,
  type TagRule,
} from "@/lib/tracking/tag-rules";

function payment(extra: Partial<TaggablePayment> = {}): TaggablePayment {
  return {
    amountCents: 99700,
    email: "buyer@example.com",
    label: "Operation Room",
    provider: "stripe",
    kind: "charge",
    ...extra,
  };
}

function rule(extra: Partial<TagRule> = {}): TagRule {
  return {
    id: "r1",
    tag: "core-offer",
    matchField: "label",
    matchOp: "contains",
    matchValue: "operation",
    countsAsRevenue: true,
    countsAsOptin: false,
    exclude: false,
    excludeFromAov: false,
    hideFromDashboard: false,
    sortOrder: 0,
    active: true,
    ...extra,
  };
}

describe("ruleMatches", () => {
  it("matches strings case-insensitively with trimming", () => {
    expect(ruleMatches(rule({ matchValue: "  OPERATION " }), payment())).toBe(true);
    expect(
      ruleMatches(rule({ matchOp: "equals", matchValue: "operation room" }), payment()),
    ).toBe(true);
  });

  it("supports starts_with and ends_with", () => {
    expect(
      ruleMatches(rule({ matchOp: "starts_with", matchValue: "oper" }), payment()),
    ).toBe(true);
    expect(
      ruleMatches(rule({ matchOp: "ends_with", matchValue: "room" }), payment()),
    ).toBe(true);
    expect(
      ruleMatches(rule({ matchOp: "starts_with", matchValue: "room" }), payment()),
    ).toBe(false);
  });

  it("an empty match value never matches a substring op", () => {
    // "".includes("") is true — without the guard an empty rule tags EVERYTHING.
    expect(ruleMatches(rule({ matchValue: "" }), payment())).toBe(false);
  });

  it("a null field never matches", () => {
    expect(ruleMatches(rule(), payment({ label: null }))).toBe(false);
  });

  it("compares amounts as integer cents", () => {
    const gte = rule({
      matchField: "amount_cents",
      matchOp: "amount_gte",
      matchValue: "50000",
    });
    expect(ruleMatches(gte, payment({ amountCents: 99700 }))).toBe(true);
    expect(ruleMatches(gte, payment({ amountCents: 4900 }))).toBe(false);
    const eq = rule({
      matchField: "amount_cents",
      matchOp: "amount_eq",
      matchValue: "4900",
    });
    expect(ruleMatches(eq, payment({ amountCents: 4900 }))).toBe(true);
  });

  it("a malformed numeric value never matches and never throws", () => {
    const bad = rule({
      matchField: "amount_cents",
      matchOp: "amount_gte",
      matchValue: "about $500",
    });
    expect(ruleMatches(bad, payment())).toBe(false);
    const float = rule({
      matchField: "amount_cents",
      matchOp: "amount_eq",
      matchValue: "49.99",
    });
    expect(ruleMatches(float, payment({ amountCents: 4999 }))).toBe(false);
  });

  it("a string op on the amount field never matches", () => {
    expect(
      ruleMatches(
        rule({ matchField: "amount_cents", matchOp: "contains", matchValue: "997" }),
        payment(),
      ),
    ).toBe(false);
  });
});

describe("classifyPayment", () => {
  it("collects tags from every matching rule, deduped, in sort order", () => {
    const rules = [
      rule({ id: "b", tag: "high-ticket", sortOrder: 2 }),
      rule({ id: "a", tag: "core-offer", sortOrder: 1 }),
      rule({ id: "c", tag: "core-offer", sortOrder: 3 }),
    ];
    const v = classifyPayment(payment(), rules);
    expect(v.tags).toEqual(["core-offer", "high-ticket"]);
    expect(v.matchedRuleIds).toEqual(["a", "b", "c"]);
  });

  it("revenue is the default; demotion wins over any other matching rule", () => {
    const rules = [
      rule({ id: "keep", tag: "core-offer", countsAsRevenue: true }),
      rule({
        id: "demote",
        tag: "fee-passthrough",
        countsAsRevenue: false,
        sortOrder: 5,
      }),
    ];
    expect(classifyPayment(payment(), rules).countsAsRevenue).toBe(false);
  });

  it("OR-flags: one matching rule is enough to exclude or hide", () => {
    const rules = [
      rule({ id: "tag", tag: "core-offer" }),
      rule({
        id: "test-charge",
        tag: "test",
        matchField: "email",
        matchOp: "ends_with",
        matchValue: "@example.com",
        exclude: true,
        hideFromDashboard: true,
        sortOrder: 1,
      }),
    ];
    const v = classifyPayment(payment(), rules);
    expect(v.excluded).toBe(true);
    expect(v.hideFromDashboard).toBe(true);
  });

  it("marks opt-ins (the low-ticket front end) without touching revenue", () => {
    const optin = rule({
      id: "lt",
      tag: "low-ticket",
      matchField: "amount_cents",
      matchOp: "amount_lte",
      matchValue: "4900",
      countsAsOptin: true,
      excludeFromAov: true,
    });
    const v = classifyPayment(payment({ amountCents: 4900 }), [optin]);
    expect(v.countsAsOptin).toBe(true);
    expect(v.excludeFromAov).toBe(true);
    expect(v.countsAsRevenue).toBe(true);
  });

  it("inactive rules never fire", () => {
    const v = classifyPayment(payment(), [rule({ active: false, exclude: true })]);
    expect(v.tags).toEqual([]);
    expect(v.excluded).toBe(false);
  });

  it("no rules = the honest default verdict", () => {
    const v = classifyPayment(payment(), []);
    expect(v).toEqual({
      tags: [],
      excluded: false,
      countsAsRevenue: true,
      countsAsOptin: false,
      excludeFromAov: false,
      hideFromDashboard: false,
      matchedRuleIds: [],
    });
  });

  it("classifies refunds like anything else — sign stays the engine's job", () => {
    const v = classifyPayment(payment({ kind: "refund" }), [
      rule({
        id: "k",
        matchField: "kind",
        matchOp: "equals",
        matchValue: "refund",
        tag: "refund",
      }),
    ]);
    expect(v.tags).toEqual(["refund"]);
  });
});
