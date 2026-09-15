/**
 * Payment tag rules — declarative classification for payment feeds.
 *
 * A rule matches one field of a payment against one value and, when it hits,
 * applies a tag plus a set of meaning-flags. This is how one raw processor
 * feed gets sliced into offers and funnels WITHOUT hardcoding per-client
 * logic: the data stays untouched, the rules say what each payment means.
 *
 * Semantics (deliberate, documented, tested):
 * - Rules are evaluated in sortOrder; inactive rules never match.
 * - EVERY active matching rule contributes its tag — a payment can carry
 *   several tags at once.
 * - Flags combine across matching rules:
 *   · exclude, hideFromDashboard, excludeFromAov, countsAsOptin — OR:
 *     any single matching rule is enough to set them.
 *   · countsAsRevenue — demotion wins: revenue is the DEFAULT meaning of a
 *     charge, so a rule only ever takes revenue away (fee pass-throughs,
 *     internal transfers). If any matching rule says countsAsRevenue=false,
 *     the payment does not count.
 * - String matching is case-insensitive and trims both sides. Numeric ops
 *   parse matchValue as integer cents; a non-numeric value simply never
 *   matches (a bad rule must not throw in the money path).
 * - Refunds are classified like anything else — tags describe identity, the
 *   metrics engine still handles sign by `kind`.
 *
 * The classifier is pure: same payment + same rules = same answer, no I/O.
 */

import { cents, formatUSD, fromDollars } from "@/lib/money";

export type TagRuleField = "label" | "email" | "provider" | "kind" | "amount_cents";

export type TagRuleOp =
  | "equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "amount_eq"
  | "amount_gte"
  | "amount_lte";

export type TagRule = {
  id: string;
  tag: string;
  matchField: TagRuleField;
  matchOp: TagRuleOp;
  matchValue: string;
  countsAsRevenue: boolean;
  countsAsOptin: boolean;
  exclude: boolean;
  excludeFromAov: boolean;
  hideFromDashboard: boolean;
  sortOrder: number;
  active: boolean;
};

export type TaggablePayment = {
  amountCents: number;
  email: string | null;
  label: string | null;
  provider: string;
  kind: string;
};

export type TagVerdict = {
  /** Tags from every matching rule, in rule order, deduped. */
  tags: string[];
  /** Drop from every metric — test charges, internal transfers. */
  excluded: boolean;
  /** Whether this payment's cash counts as revenue (demotion wins). */
  countsAsRevenue: boolean;
  /** This payment marks its payer as an opt-in (e.g. a low-ticket front end). */
  countsAsOptin: boolean;
  /** Keep in cash totals but out of AOV / deal-size denominators. */
  excludeFromAov: boolean;
  /** Kept in ledgers, not surfaced on dashboards. */
  hideFromDashboard: boolean;
  /** Which rules fired, for explainability ("why is this tagged?"). */
  matchedRuleIds: string[];
};

const STRING_FIELDS: Record<Exclude<TagRuleField, "amount_cents">, true> = {
  label: true,
  email: true,
  provider: true,
  kind: true,
};

/** Only ever called after the STRING_FIELDS guard, so the field is a text field. */
function stringValue(
  payment: TaggablePayment,
  field: Exclude<TagRuleField, "amount_cents">,
): string | null {
  const values: Record<Exclude<TagRuleField, "amount_cents">, string | null> = {
    label: payment.label,
    email: payment.email,
    provider: payment.provider,
    kind: payment.kind,
  };
  return values[field];
}

export function ruleMatches(rule: TagRule, payment: TaggablePayment): boolean {
  if (rule.matchField === "amount_cents") {
    // Integer cents only. A malformed value never matches and never throws.
    const wanted = Number(rule.matchValue.trim());
    if (!Number.isFinite(wanted) || !Number.isInteger(wanted)) return false;
    switch (rule.matchOp) {
      case "amount_eq":
        return payment.amountCents === wanted;
      case "amount_gte":
        return payment.amountCents >= wanted;
      case "amount_lte":
        return payment.amountCents <= wanted;
      default:
        return false;
    }
  }

  if (!(rule.matchField in STRING_FIELDS)) return false;
  const field = stringValue(
    payment,
    rule.matchField as Exclude<TagRuleField, "amount_cents">,
  );
  if (field === null) return false;
  const have = field.trim().toLowerCase();
  const want = rule.matchValue.trim().toLowerCase();
  switch (rule.matchOp) {
    case "equals":
      return have === want;
    case "contains":
      return want.length > 0 && have.includes(want);
    case "starts_with":
      return want.length > 0 && have.startsWith(want);
    case "ends_with":
      return want.length > 0 && have.endsWith(want);
    default:
      return false;
  }
}

export function classifyPayment(
  payment: TaggablePayment,
  rules: TagRule[],
): TagVerdict {
  const ordered = rules
    .filter((r) => r.active)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const verdict: TagVerdict = {
    tags: [],
    excluded: false,
    countsAsRevenue: true,
    countsAsOptin: false,
    excludeFromAov: false,
    hideFromDashboard: false,
    matchedRuleIds: [],
  };

  for (const rule of ordered) {
    if (!ruleMatches(rule, payment)) continue;
    verdict.matchedRuleIds.push(rule.id);
    if (!verdict.tags.includes(rule.tag)) verdict.tags.push(rule.tag);
    if (rule.exclude) verdict.excluded = true;
    if (rule.countsAsOptin) verdict.countsAsOptin = true;
    if (rule.excludeFromAov) verdict.excludeFromAov = true;
    if (rule.hideFromDashboard) verdict.hideFromDashboard = true;
    if (!rule.countsAsRevenue) verdict.countsAsRevenue = false;
  }

  return verdict;
}

// ---------------------------------------------------------------------------
// Rule vocabulary + input validation (the admin editor and the store share it)
// ---------------------------------------------------------------------------

export const TAG_RULE_FIELDS: readonly TagRuleField[] = [
  "label",
  "email",
  "provider",
  "kind",
  "amount_cents",
];

export const STRING_OPS: readonly TagRuleOp[] = [
  "equals",
  "contains",
  "starts_with",
  "ends_with",
];

export const AMOUNT_OPS: readonly TagRuleOp[] = [
  "amount_eq",
  "amount_gte",
  "amount_lte",
];

/** What an admin types into the rule editor, before it is trusted. */
export type TagRuleInput = {
  tag: string;
  matchField: string;
  matchOp: string;
  /** For amount ops this is DOLLARS as typed ("250", "1,500.00"). */
  matchValue: string;
  countsAsRevenue: boolean;
  countsAsOptin: boolean;
  exclude: boolean;
  excludeFromAov: boolean;
  hideFromDashboard: boolean;
  sortOrder: number;
  active: boolean;
};

/** A validated rule, ready to store — amount values already in integer cents. */
export type CleanTagRule = Omit<TagRule, "id">;

export type TagRuleValidation =
  { ok: true; rule: CleanTagRule } | { ok: false; errors: string[] };

const TAG_SHAPE = /^[a-z0-9][a-z0-9 _-]{0,39}$/;

/** A typed dollar figure as integer cents, or null when it is not a positive amount. */
export function dollarsToCents(raw: string): number | null {
  try {
    const value = fromDollars(raw);
    return value < 0 ? null : value;
  } catch {
    return null;
  }
}

/**
 * Validate an editor submission. Errors are sentences a person can act on —
 * they are the only guidance the editor gives, so they say what to do, not
 * just what failed.
 */
export function validateTagRule(input: TagRuleInput): TagRuleValidation {
  const errors: string[] = [];
  const tag = input.tag.trim().toLowerCase();
  if (!TAG_SHAPE.test(tag)) {
    errors.push(
      "Give the tag a short name: lowercase letters, numbers, spaces, dashes or underscores, up to 40 characters (for example test-charge).",
    );
  }

  const field = input.matchField as TagRuleField;
  const op = input.matchOp as TagRuleOp;
  const knownField = TAG_RULE_FIELDS.includes(field);
  if (!knownField) {
    errors.push(
      "Pick which part of the payment to match: label, email, provider, kind or amount.",
    );
  }
  const isAmountField = field === "amount_cents";
  if (isAmountField && !AMOUNT_OPS.includes(op)) {
    errors.push(
      "An amount can only be matched as exactly, at least, or at most a dollar figure.",
    );
  }
  if (knownField && !isAmountField && !STRING_OPS.includes(op)) {
    errors.push("Text fields match as is, contains, starts with, or ends with.");
  }

  let matchValue = input.matchValue.trim();
  if (isAmountField) {
    const cents = dollarsToCents(matchValue);
    if (cents === null) {
      errors.push("Write the amount as dollars, like 250 or 1,500.00.");
    } else {
      matchValue = String(cents);
    }
  } else if (matchValue.length === 0) {
    errors.push(
      "Say what to look for. An empty match value would tag nothing, so the rule would do nothing.",
    );
  } else if (matchValue.length > 200) {
    errors.push("Keep the match value under 200 characters.");
  }

  if (
    !Number.isInteger(input.sortOrder) ||
    input.sortOrder < 0 ||
    input.sortOrder > 10_000
  ) {
    errors.push("Order must be a whole number between 0 and 10,000.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    rule: {
      tag,
      matchField: field,
      matchOp: op,
      matchValue,
      countsAsRevenue: input.countsAsRevenue,
      countsAsOptin: input.countsAsOptin,
      exclude: input.exclude,
      excludeFromAov: input.excludeFromAov,
      hideFromDashboard: input.hideFromDashboard,
      sortOrder: input.sortOrder,
      active: input.active,
    },
  };
}

const FIELD_WORD: Record<TagRuleField, string> = {
  label: "label",
  email: "email",
  provider: "provider",
  kind: "kind",
  amount_cents: "amount",
};

const OP_WORD: Record<TagRuleOp, string> = {
  equals: "is",
  contains: "contains",
  starts_with: "starts with",
  ends_with: "ends with",
  amount_eq: "is exactly",
  amount_gte: "is at least",
  amount_lte: "is at most",
};

/** Human wording for a rule's condition, e.g. `label contains "front end"`. */
export function describeRule(
  rule: Pick<TagRule, "matchField" | "matchOp" | "matchValue">,
): string {
  const value =
    rule.matchField === "amount_cents"
      ? formatUSD(cents(Number(rule.matchValue)))
      : `"${rule.matchValue}"`;
  return `${FIELD_WORD[rule.matchField]} ${OP_WORD[rule.matchOp]} ${value}`;
}

// ---------------------------------------------------------------------------
// Applying rules to a dashboard payment feed
// ---------------------------------------------------------------------------

/** The fields a feed payment exposes to rules. Everything else passes through. */
export type RuleablePayment = {
  cashCents: number | null;
  email: string | null;
  label?: string | null;
  provider?: string | null;
  kind?: string | null;
};

export type HiddenReason = "excluded" | "hidden" | "not_revenue";

export type FeedTagSummary = {
  /** Payments taken out of the dashboard figures, across the whole feed. */
  hiddenCount: number;
  /** Their cash as magnitudes (a hidden refund is money that went back). */
  hiddenCashCents: number;
  /** Per reason, so the footnote can say WHY money left the numbers. */
  byReason: Record<HiddenReason, { count: number; cashCents: number }>;
  /** Payments that matched at least one rule, hidden or not. */
  taggedCount: number;
  /** Distinct tags seen across the feed, in first-seen order. */
  tags: string[];
};

export type TaggedFeed<P> = { kept: P[]; summary: FeedTagSummary };

export function emptyTagSummary(): FeedTagSummary {
  return {
    hiddenCount: 0,
    hiddenCashCents: 0,
    byReason: {
      excluded: { count: 0, cashCents: 0 },
      hidden: { count: 0, cashCents: 0 },
      not_revenue: { count: 0, cashCents: 0 },
    },
    taggedCount: 0,
    tags: [],
  };
}

/** Why a verdict takes a payment out of dashboard money, or null to keep it. */
export function dashboardHiddenReason(verdict: TagVerdict): HiddenReason | null {
  if (verdict.excluded) return "excluded";
  if (verdict.hideFromDashboard) return "hidden";
  if (!verdict.countsAsRevenue) return "not_revenue";
  return null;
}

/** A feed payment in the shape the classifier reads. Amount is a magnitude. */
export function toTaggable(p: RuleablePayment): TaggablePayment {
  return {
    amountCents: Math.abs(p.cashCents ?? 0),
    email: p.email,
    label: p.label ?? null,
    provider: p.provider ?? "",
    kind: p.kind ?? "",
  };
}

/**
 * Run a client's rules over a dashboard payment feed.
 *
 * Kept payments come back as the SAME objects in the SAME order; with no active
 * rules the input array itself is returned, so an offer without rules computes
 * byte-identical figures to before rules existed. Excluded, dashboard-hidden
 * and not-revenue payments leave the feed and are counted in the summary: the
 * money is never silently dropped, it is named.
 */
export function applyTagRulesToFeed<P extends RuleablePayment>(
  payments: P[],
  rules: TagRule[],
): TaggedFeed<P> {
  const summary = emptyTagSummary();
  if (!rules.some((r) => r.active)) return { kept: payments, summary };

  const kept: P[] = [];
  for (const p of payments) {
    const verdict = classifyPayment(toTaggable(p), rules);
    if (verdict.matchedRuleIds.length > 0) {
      summary.taggedCount += 1;
      for (const t of verdict.tags) if (!summary.tags.includes(t)) summary.tags.push(t);
    }
    const reason = dashboardHiddenReason(verdict);
    if (reason === null) {
      kept.push(p);
      continue;
    }
    const cash = Math.abs(p.cashCents ?? 0);
    summary.hiddenCount += 1;
    summary.hiddenCashCents += cash;
    summary.byReason[reason].count += 1;
    summary.byReason[reason].cashCents += cash;
  }
  return { kept, summary };
}

/** How many feed payments (and how much cash) one rule matches on its own. */
export function previewRule(
  rule: TagRule,
  payments: RuleablePayment[],
): { count: number; cashCents: number } {
  let count = 0;
  let cashCents = 0;
  for (const p of payments) {
    if (!ruleMatches(rule, toTaggable(p))) continue;
    count += 1;
    cashCents += Math.abs(p.cashCents ?? 0);
  }
  return { count, cashCents };
}
