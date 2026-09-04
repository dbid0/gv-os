import { describe, it, expect } from "vitest";
import {
  type CompRule,
  compForDeal,
  describeRule,
  isEffectiveOn,
  isPercentageBasis,
  isRuleConfigured,
  resolveCompRule,
} from "@/lib/sales/rep-comp";
import { cents } from "@/lib/money";

const d = (s: string) => new Date(s);

function rule(over: Partial<CompRule> = {}): CompRule {
  return {
    id: "r1",
    offerId: "offer-a",
    role: "closer",
    repId: null,
    basis: "cash_collected",
    rateBps: 1250,
    flatCents: null,
    tierThresholdCents: null,
    tierRateBps: null,
    effectiveFrom: d("2026-01-01"),
    effectiveTo: null,
    ...over,
  };
}

const AMOUNTS = { cashCollectedCents: cents(1_000_00), revenueCents: cents(2_000_00) };

describe("effective dating", () => {
  it("includes the start date and excludes the end date", () => {
    const r = rule({ effectiveFrom: d("2026-03-01"), effectiveTo: d("2026-04-01") });
    expect(isEffectiveOn(r, d("2026-02-28"))).toBe(false);
    expect(isEffectiveOn(r, d("2026-03-01"))).toBe(true);
    expect(isEffectiveOn(r, d("2026-03-31"))).toBe(true);
    expect(isEffectiveOn(r, d("2026-04-01"))).toBe(false);
  });

  it("an open-ended rule stays live", () => {
    expect(isEffectiveOn(rule({ effectiveTo: null }), d("2030-01-01"))).toBe(true);
  });

  it("a rate change does not restate history — the old deal keeps the old rate", () => {
    const rules = [
      rule({
        id: "old",
        rateBps: 1000,
        effectiveFrom: d("2026-01-01"),
        effectiveTo: d("2026-06-01"),
      }),
      rule({ id: "new", rateBps: 1500, effectiveFrom: d("2026-06-01") }),
    ];
    const q = { offerId: "offer-a", role: "closer", repId: "rep-1" };
    expect(resolveCompRule(rules, { ...q, on: d("2026-05-31") })!.id).toBe("old");
    expect(resolveCompRule(rules, { ...q, on: d("2026-06-02") })!.id).toBe("new");
    // the whole point: recomputing a May payout in July still gives May's rate
    expect(
      compForDeal(resolveCompRule(rules, { ...q, on: d("2026-05-31") })!, AMOUNTS),
    ).toBe(100_00);
  });
});

describe("precedence", () => {
  it("a rep override beats the offer default", () => {
    const rules = [
      rule({ id: "default", repId: null, rateBps: 1000 }),
      rule({ id: "override", repId: "rep-1", rateBps: 2000 }),
    ];
    const got = resolveCompRule(rules, {
      offerId: "offer-a",
      role: "closer",
      repId: "rep-1",
      on: d("2026-05-01"),
    });
    expect(got!.id).toBe("override");
  });

  it("another rep still gets the default", () => {
    const rules = [
      rule({ id: "default", repId: null, rateBps: 1000 }),
      rule({ id: "override", repId: "rep-1", rateBps: 2000 }),
    ];
    const got = resolveCompRule(rules, {
      offerId: "offer-a",
      role: "closer",
      repId: "rep-2",
      on: d("2026-05-01"),
    });
    expect(got!.id).toBe("default");
  });

  it("the SAME rep is paid differently on two offers — the reason this module exists", () => {
    const rules = [
      rule({
        id: "sub",
        offerId: "offer-sub",
        basis: "per_close",
        rateBps: null,
        flatCents: cents(5_00),
      }),
      rule({ id: "mastermind", offerId: "offer-mm", rateBps: 1250 }),
    ];
    const q = { role: "closer", repId: "rep-1", on: d("2026-05-01") };
    expect(
      compForDeal(resolveCompRule(rules, { ...q, offerId: "offer-sub" })!, AMOUNTS),
    ).toBe(5_00);
    expect(
      compForDeal(resolveCompRule(rules, { ...q, offerId: "offer-mm" })!, AMOUNTS),
    ).toBe(125_00);
  });

  it("returns null for an unconfigured offer rather than guessing a rate", () => {
    expect(
      resolveCompRule([rule()], {
        offerId: "offer-unknown",
        role: "closer",
        repId: "rep-1",
        on: d("2026-05-01"),
      }),
    ).toBeNull();
  });

  it("roles do not bleed into each other", () => {
    const rules = [
      rule({ id: "closer", role: "closer" }),
      rule({ id: "setter", role: "setter" }),
    ];
    const q = { offerId: "offer-a", repId: "rep-1", on: d("2026-05-01") };
    expect(resolveCompRule(rules, { ...q, role: "setter" })!.id).toBe("setter");
  });

  it("two rules starting the same day resolve deterministically, never by row order", () => {
    const a = rule({ id: "aaa" });
    const b = rule({ id: "zzz" });
    const q = {
      offerId: "offer-a",
      role: "closer",
      repId: "rep-1",
      on: d("2026-05-01"),
    };
    expect(resolveCompRule([a, b], q)!.id).toBe(resolveCompRule([b, a], q)!.id);
  });
});

describe("the four bases", () => {
  it("percentage of cash collected", () => {
    expect(compForDeal(rule({ basis: "cash_collected", rateBps: 1250 }), AMOUNTS)).toBe(
      125_00,
    );
  });

  it("percentage of deal revenue", () => {
    expect(compForDeal(rule({ basis: "deal_revenue", rateBps: 1000 }), AMOUNTS)).toBe(
      200_00,
    );
  });

  it("flat per booking ignores the deal size", () => {
    const r = rule({ basis: "per_booking", rateBps: null, flatCents: cents(350_00) });
    expect(compForDeal(r, AMOUNTS)).toBe(350_00);
    expect(
      compForDeal(r, { cashCollectedCents: cents(0), revenueCents: cents(0) }),
    ).toBe(350_00);
  });

  it("a base pays regardless of deal amounts", () => {
    expect(
      compForDeal(
        rule({ basis: "base", rateBps: null, flatCents: cents(1_500_00) }),
        AMOUNTS,
      ),
    ).toBe(1_500_00);
  });

  it("classifies bases correctly", () => {
    expect(isPercentageBasis("cash_collected")).toBe(true);
    expect(isPercentageBasis("per_booking")).toBe(false);
  });
});

describe("tiers", () => {
  const tiered = rule({
    rateBps: 1250,
    tierThresholdCents: cents(5_000_00),
    tierRateBps: 1500,
  });

  it("uses the base rate below the threshold", () => {
    expect(compForDeal(tiered, AMOUNTS, cents(4_999_00))).toBe(125_00);
  });

  it("uses the tier rate at and past the threshold", () => {
    expect(compForDeal(tiered, AMOUNTS, cents(5_000_00))).toBe(150_00);
  });

  it("ignores a tier when only one half is configured", () => {
    const half = rule({
      rateBps: 1250,
      tierThresholdCents: cents(100),
      tierRateBps: null,
    });
    expect(compForDeal(half, AMOUNTS, cents(999_999_00))).toBe(125_00);
  });
});

describe("safety", () => {
  it("an unconfigured rate pays zero rather than throwing mid-payout", () => {
    expect(compForDeal(rule({ rateBps: null }), AMOUNTS)).toBe(0);
    expect(isRuleConfigured(rule({ rateBps: null }))).toBe(false);
    expect(
      isRuleConfigured(
        rule({ basis: "per_close", rateBps: null, flatCents: cents(10_00) }),
      ),
    ).toBe(true);
  });

  it("rejects a negative rate", () => {
    expect(() => compForDeal(rule({ rateBps: -1 }), AMOUNTS)).toThrow(RangeError);
  });

  it("returns whole cents, never a float", () => {
    const got = compForDeal(rule({ rateBps: 1233 }), {
      cashCollectedCents: cents(1_358_99),
      revenueCents: cents(0),
    });
    expect(Number.isInteger(got)).toBe(true);
  });
});

describe("describeRule — every payout line must be explainable", () => {
  it("reads a percentage rule", () => {
    expect(describeRule(rule({ rateBps: 1250 }))).toBe("12.5% of cash collected");
  });
  it("reads a flat rule", () => {
    expect(
      describeRule(
        rule({ basis: "per_booking", rateBps: null, flatCents: cents(350_00) }),
      ),
    ).toBe("$350 per booking");
  });
  it("says so when nothing is configured", () => {
    expect(describeRule(rule({ rateBps: null }))).toBe("no rate set");
  });
});
