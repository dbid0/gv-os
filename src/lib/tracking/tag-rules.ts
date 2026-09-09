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

function stringValue(payment: TaggablePayment, field: TagRuleField): string | null {
  switch (field) {
    case "label":
      return payment.label;
    case "email":
      return payment.email;
    case "provider":
      return payment.provider;
    case "kind":
      return payment.kind;
    default:
      return null;
  }
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
  const field = stringValue(payment, rule.matchField);
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
