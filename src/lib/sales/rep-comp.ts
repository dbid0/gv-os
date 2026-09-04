/**
 * Per-offer rep compensation.
 *
 * `reps.commission_bps` is a single rate per rep, which cannot express what GV
 * actually does: a $49/mo subscription, a $997 course and a $10K mastermind are
 * paid on completely different models, and one rep may sell all three. This module
 * resolves which rule applies to a given (offer, role, rep, date) and turns it into
 * cents.
 *
 * Two properties matter more than anything else here:
 *
 *   1. Effective dating. Rules are never edited in place. Changing a rate writes a
 *      new row and closes the old one, so a payout computed last month recomputes
 *      to the same number forever. A rate change must never silently restate
 *      history — that is how you underpay someone retroactively.
 *
 *   2. Determinism. Given the same inputs the resolver returns the same rule, with
 *      ties broken explicitly rather than by row order. Nothing here reads the
 *      clock; the caller passes the date the deal was written.
 *
 * All money is integer cents and every rate is whole basis points, mirroring
 * `commission.ts` and the accounting side.
 */

import { type Cents, applyBps, ZERO } from "@/lib/money";
import { type Bps } from "@/lib/splits";

/** What a rule pays on. */
export type CompBasis =
  "cash_collected" | "deal_revenue" | "per_booking" | "per_close" | "base";

/** The percentage bases — the ones that multiply an amount rather than pay a flat sum. */
const PERCENTAGE_BASES: ReadonlySet<CompBasis> = new Set<CompBasis>([
  "cash_collected",
  "deal_revenue",
]);

export function isPercentageBasis(basis: CompBasis): boolean {
  return PERCENTAGE_BASES.has(basis);
}

/** One configured rule, as stored. Dates are the effective window. */
export interface CompRule {
  id: string;
  offerId: string;
  role: string;
  /** Null = the offer-wide default for this role. Set = an override for one rep. */
  repId: string | null;
  basis: CompBasis;
  rateBps: Bps | null;
  flatCents: Cents | null;
  tierThresholdCents: Cents | null;
  tierRateBps: Bps | null;
  effectiveFrom: Date;
  /** Null = still current. */
  effectiveTo: Date | null;
}

/** What we are resolving a rule for. */
export interface CompLookup {
  offerId: string;
  role: string;
  repId: string;
  /** The date the deal was written — NOT today. History must stay reproducible. */
  on: Date;
}

/** A rule is live on a date when the date falls inside [from, to). */
export function isEffectiveOn(rule: CompRule, on: Date): boolean {
  if (on < rule.effectiveFrom) return false;
  if (rule.effectiveTo !== null && on >= rule.effectiveTo) return false;
  return true;
}

/**
 * The rule that applies, or null when the offer has no rule for that role.
 *
 * Precedence: a rep-specific override beats the offer default. Within the same
 * specificity the later `effectiveFrom` wins, so a newer rule supersedes an older
 * one that was left open-ended. Null is a legitimate answer and callers must
 * handle it — an unconfigured offer pays nothing rather than guessing a rate.
 */
export function resolveCompRule(
  rules: readonly CompRule[],
  q: CompLookup,
): CompRule | null {
  const live = rules.filter(
    (r) => r.offerId === q.offerId && r.role === q.role && isEffectiveOn(r, q.on),
  );
  const overrides = live.filter((r) => r.repId === q.repId);
  const defaults = live.filter((r) => r.repId === null);
  const pool = overrides.length > 0 ? overrides : defaults;
  if (pool.length === 0) return null;

  return pool.reduce((best, r) => {
    if (r.effectiveFrom.getTime() !== best.effectiveFrom.getTime()) {
      return r.effectiveFrom > best.effectiveFrom ? r : best;
    }
    // Same start date is a config mistake; break it deterministically by id so the
    // same inputs never produce two different payouts.
    return r.id > best.id ? r : best;
  });
}

/** The amounts a rule can be applied to. */
export interface CompAmounts {
  cashCollectedCents: Cents;
  revenueCents: Cents;
}

/**
 * What one rule pays on one deal.
 *
 * `priorPeriodCents` is how much the rep has already earned toward a tier in the
 * period. When a tier is configured and that total has passed the threshold, the
 * tier rate applies. Tiering is deliberately all-or-nothing per deal rather than
 * blended — a blended rate cannot be explained to a rep looking at one line.
 */
export function compForDeal(
  rule: CompRule,
  amounts: CompAmounts,
  priorPeriodCents: Cents = ZERO,
): Cents {
  if (!isPercentageBasis(rule.basis)) {
    return rule.flatCents ?? ZERO;
  }

  const base =
    rule.basis === "cash_collected" ? amounts.cashCollectedCents : amounts.revenueCents;

  const tiered =
    rule.tierThresholdCents !== null &&
    rule.tierRateBps !== null &&
    priorPeriodCents >= rule.tierThresholdCents;

  const rate = tiered ? rule.tierRateBps! : rule.rateBps;
  if (rate === null) return ZERO;
  if (rate < 0) {
    throw new RangeError(`comp rate cannot be negative, received ${rate} bps`);
  }
  return applyBps(base, rate);
}

/** A rule with no usable rate pays nothing and should be flagged in the UI. */
export function isRuleConfigured(rule: CompRule): boolean {
  return isPercentageBasis(rule.basis)
    ? rule.rateBps !== null
    : rule.flatCents !== null;
}

/**
 * How a rule reads to a human, for the payout line.
 *
 * A payout you cannot explain is one you cannot defend to a rep, so every derived
 * figure carries the rule that produced it.
 */
export function describeRule(rule: CompRule): string {
  if (isPercentageBasis(rule.basis)) {
    if (rule.rateBps === null) return "no rate set";
    const pct = (rule.rateBps / 100).toFixed(2).replace(/\.?0+$/, "");
    const on = rule.basis === "cash_collected" ? "cash collected" : "deal revenue";
    const tier =
      rule.tierThresholdCents !== null && rule.tierRateBps !== null
        ? `, then ${(rule.tierRateBps / 100).toFixed(2).replace(/\.?0+$/, "")}% past ${
            rule.tierThresholdCents / 100
          }`
        : "";
    return `${pct}% of ${on}${tier}`;
  }
  if (rule.flatCents === null) return "no amount set";
  const dollars = (rule.flatCents / 100).toFixed(2).replace(/\.00$/, "");
  const unit =
    rule.basis === "per_booking"
      ? "per booking"
      : rule.basis === "per_close"
        ? "per close"
        : "base";
  return `$${dollars} ${unit}`;
}
