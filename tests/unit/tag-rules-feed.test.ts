import { describe, expect, it } from "vitest";

import {
  applyTagRulesToFeed,
  classifyPayment,
  dashboardHiddenReason,
  describeRule,
  dollarsToCents,
  emptyTagSummary,
  previewRule,
  toTaggable,
  validateTagRule,
  type RuleablePayment,
  type TagRule,
  type TagRuleInput,
} from "@/lib/tracking/tag-rules";

function rule(extra: Partial<TagRule> = {}): TagRule {
  return {
    id: "r1",
    tag: "test-charge",
    matchField: "label",
    matchOp: "contains",
    matchValue: "test",
    countsAsRevenue: true,
    countsAsOptin: false,
    exclude: false,
    excludeFromAov: false,
    hideFromDashboard: false,
    sortOrder: 100,
    active: true,
    ...extra,
  };
}

function input(extra: Partial<TagRuleInput> = {}): TagRuleInput {
  return {
    tag: "Front End",
    matchField: "label",
    matchOp: "contains",
    matchValue: "  starter kit ",
    countsAsRevenue: true,
    countsAsOptin: false,
    exclude: false,
    excludeFromAov: false,
    hideFromDashboard: false,
    sortOrder: 100,
    active: true,
    ...extra,
  };
}

type FeedRow = RuleablePayment & { id: string; occurredAt: Date };

const feed: FeedRow[] = [
  {
    id: "a",
    cashCents: 99_700,
    email: "one@example.com",
    label: "Core program",
    provider: "Stripe",
    kind: "charge",
    occurredAt: new Date("2026-09-01T00:00:00Z"),
  },
  {
    id: "b",
    cashCents: 100,
    email: "ops@example.com",
    label: "TEST charge",
    provider: "Stripe",
    kind: "charge",
    occurredAt: new Date("2026-09-02T00:00:00Z"),
  },
  {
    id: "c",
    cashCents: -2_500,
    email: "two@example.com",
    label: "Processing fee pass-through",
    provider: "Stripe",
    kind: "refund",
    occurredAt: new Date("2026-09-03T00:00:00Z"),
  },
  {
    id: "d",
    cashCents: null,
    email: null,
    occurredAt: new Date("2026-09-04T00:00:00Z"),
  },
];

describe("validateTagRule", () => {
  it("normalises a good text rule: tag lowercased, value trimmed", () => {
    const res = validateTagRule(input());
    expect(res).toEqual({
      ok: true,
      rule: expect.objectContaining({
        tag: "front end",
        matchField: "label",
        matchOp: "contains",
        matchValue: "starter kit",
      }),
    });
  });

  it("stores amount rules as integer cents from typed dollars", () => {
    const res = validateTagRule(
      input({
        matchField: "amount_cents",
        matchOp: "amount_gte",
        matchValue: "$1,500.50",
      }),
    );
    expect(res.ok && res.rule.matchValue).toBe("150050");
  });

  it("rejects a malformed tag with a sentence that says what to do", () => {
    const res = validateTagRule(input({ tag: "!!" }));
    expect(res.ok).toBe(false);
    expect(!res.ok && res.errors[0]).toMatch(/short name/);
  });

  it("rejects an unknown field", () => {
    const res = validateTagRule(input({ matchField: "rep" }));
    expect(!res.ok && res.errors.join(" ")).toMatch(/which part of the payment/);
  });

  it("rejects a text op on the amount field and an amount op on a text field", () => {
    const amountWithText = validateTagRule(
      input({ matchField: "amount_cents", matchOp: "contains", matchValue: "10" }),
    );
    expect(!amountWithText.ok && amountWithText.errors.join(" ")).toMatch(
      /exactly, at least, or at most/,
    );
    const textWithAmount = validateTagRule(input({ matchOp: "amount_eq" }));
    expect(!textWithAmount.ok && textWithAmount.errors.join(" ")).toMatch(
      /is, contains, starts with, or ends with/,
    );
  });

  it("rejects an amount that is not money, including negatives and 3 decimals", () => {
    for (const bad of ["ten", "-5", "1.005", ""]) {
      const res = validateTagRule(
        input({ matchField: "amount_cents", matchOp: "amount_eq", matchValue: bad }),
      );
      expect(!res.ok && res.errors.join(" ")).toMatch(/as dollars/);
    }
  });

  it("rejects an empty or oversized text value", () => {
    expect(validateTagRule(input({ matchValue: "   " })).ok).toBe(false);
    const long = validateTagRule(input({ matchValue: "x".repeat(201) }));
    expect(!long.ok && long.errors.join(" ")).toMatch(/under 200/);
  });

  it("rejects an out-of-range or fractional order", () => {
    for (const bad of [-1, 10_001, 1.5, Number.NaN]) {
      const res = validateTagRule(input({ sortOrder: bad }));
      expect(!res.ok && res.errors.join(" ")).toMatch(/Order must be/);
    }
  });

  it("reports every problem at once, not just the first", () => {
    const res = validateTagRule(input({ tag: "", matchValue: "", sortOrder: -3 }));
    expect(!res.ok && res.errors).toHaveLength(3);
  });
});

describe("dollarsToCents", () => {
  it("parses dollars with the house money parser", () => {
    expect(dollarsToCents("997")).toBe(99_700);
    expect(dollarsToCents("0.29")).toBe(29);
    expect(dollarsToCents("$1,358.98")).toBe(135_898);
  });

  it("returns null for negatives and non-money", () => {
    expect(dollarsToCents("-1")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
  });
});

describe("describeRule", () => {
  it("reads a text rule in plain words", () => {
    expect(describeRule(rule({ matchOp: "starts_with", matchValue: "Core" }))).toBe(
      'label starts with "Core"',
    );
  });

  it("formats an amount rule as dollars", () => {
    expect(
      describeRule(
        rule({
          matchField: "amount_cents",
          matchOp: "amount_lte",
          matchValue: "150050",
        }),
      ),
    ).toBe("amount is at most $1,500.50");
  });
});

describe("toTaggable", () => {
  it("reads amounts as magnitudes and blanks missing words", () => {
    expect(toTaggable({ cashCents: -2_500, email: null })).toEqual({
      amountCents: 2_500,
      email: null,
      label: null,
      provider: "",
      kind: "",
    });
    expect(toTaggable({ cashCents: null, email: "x@y.z" }).amountCents).toBe(0);
  });
});

describe("dashboardHiddenReason", () => {
  const base = classifyPayment(toTaggable(feed[0]), []);
  it("keeps an untouched verdict", () => {
    expect(dashboardHiddenReason(base)).toBeNull();
  });
  it("orders reasons exclude > hide > not revenue", () => {
    expect(
      dashboardHiddenReason({
        ...base,
        excluded: true,
        hideFromDashboard: true,
        countsAsRevenue: false,
      }),
    ).toBe("excluded");
    expect(
      dashboardHiddenReason({
        ...base,
        hideFromDashboard: true,
        countsAsRevenue: false,
      }),
    ).toBe("hidden");
    expect(dashboardHiddenReason({ ...base, countsAsRevenue: false })).toBe(
      "not_revenue",
    );
  });
});

describe("applyTagRulesToFeed", () => {
  it("returns the SAME array with no rules — figures cannot move", () => {
    const res = applyTagRulesToFeed(feed, []);
    expect(res.kept).toBe(feed);
    expect(res.summary).toEqual(emptyTagSummary());
  });

  it("returns the same array when every rule is off", () => {
    const res = applyTagRulesToFeed(feed, [rule({ exclude: true, active: false })]);
    expect(res.kept).toBe(feed);
  });

  it("a tag-only rule labels without removing anything", () => {
    const res = applyTagRulesToFeed(feed, [rule()]);
    expect(res.kept.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(res.summary.taggedCount).toBe(1);
    expect(res.summary.tags).toEqual(["test-charge"]);
    expect(res.summary.hiddenCount).toBe(0);
  });

  it("excluded, hidden and not-revenue payments leave the feed and are named", () => {
    const res = applyTagRulesToFeed(feed, [
      rule({ id: "x", exclude: true }),
      rule({
        id: "y",
        tag: "pass-through",
        matchValue: "pass-through",
        countsAsRevenue: false,
      }),
      rule({
        id: "z",
        tag: "core",
        matchField: "amount_cents",
        matchOp: "amount_gte",
        matchValue: "99700",
        hideFromDashboard: true,
      }),
    ]);
    expect(res.kept.map((p) => p.id)).toEqual(["d"]);
    expect(res.summary.hiddenCount).toBe(3);
    expect(res.summary.hiddenCashCents).toBe(99_700 + 100 + 2_500);
    expect(res.summary.byReason).toEqual({
      excluded: { count: 1, cashCents: 100 },
      hidden: { count: 1, cashCents: 99_700 },
      not_revenue: { count: 1, cashCents: 2_500 },
    });
    // First-seen across the feed: payment a (core) comes before b and c.
    expect(res.summary.tags).toEqual(["core", "test-charge", "pass-through"]);
  });

  it("keeps kept rows as the same objects in the same order", () => {
    const res = applyTagRulesToFeed(feed, [rule({ exclude: true })]);
    expect(res.kept[0]).toBe(feed[0]);
    expect(res.kept.map((p) => p.id)).toEqual(["a", "c", "d"]);
  });

  it("counts a payment once in taggedCount even when two rules share a tag", () => {
    const res = applyTagRulesToFeed(feed, [
      rule({ id: "1" }),
      rule({ id: "2", matchValue: "charge" }),
    ]);
    expect(res.summary.taggedCount).toBe(1);
    expect(res.summary.tags).toEqual(["test-charge"]);
  });
});

describe("previewRule", () => {
  it("counts a single rule's matches and their cash magnitudes", () => {
    expect(
      previewRule(
        rule({ matchField: "provider", matchOp: "equals", matchValue: "stripe" }),
        feed,
      ),
    ).toEqual({ count: 3, cashCents: 99_700 + 100 + 2_500 });
  });

  it("previews an inactive rule as if it were on", () => {
    expect(previewRule(rule({ active: false }), feed)).toEqual({
      count: 1,
      cashCents: 100,
    });
  });

  it("matches nothing on an empty feed", () => {
    expect(previewRule(rule(), [])).toEqual({ count: 0, cashCents: 0 });
  });
});

describe("ruleMatches guard rails", () => {
  it("a text field paired with an amount operator never matches (and never throws)", () => {
    expect(
      previewRule(
        rule({ matchOp: "amount_eq" as TagRule["matchOp"], matchValue: "100" }),
        feed,
      ),
    ).toEqual({ count: 0, cashCents: 0 });
  });
});

describe("edge rows", () => {
  const zeroOrLess = rule({
    id: "zero",
    tag: "empty-row",
    matchField: "amount_cents",
    matchOp: "amount_lte",
    matchValue: "0",
    exclude: true,
  });

  it("an unknown field never matches", () => {
    expect(
      previewRule(rule({ matchField: "rep" as TagRule["matchField"] }), feed),
    ).toEqual({ count: 0, cashCents: 0 });
  });

  it("a row with no amount is hidden as $0, never NaN", () => {
    const res = applyTagRulesToFeed(feed, [zeroOrLess]);
    expect(res.kept.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(res.summary.hiddenCashCents).toBe(0);
    expect(previewRule(zeroOrLess, feed)).toEqual({ count: 1, cashCents: 0 });
  });

  it("lists a tag once when many payments carry it", () => {
    const res = applyTagRulesToFeed(feed, [
      rule({ matchField: "provider", matchOp: "equals", matchValue: "stripe" }),
    ]);
    expect(res.summary.taggedCount).toBe(3);
    expect(res.summary.tags).toEqual(["test-charge"]);
  });
});
