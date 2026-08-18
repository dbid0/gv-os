/**
 * Choosing which partner split applies.
 *
 * Splits are configuration, not constants in code: the standing 50/50 and every
 * historical override live as effective-dated rows in `app.partner_splits`. This
 * resolver answers one question purely, so it can be tested to the cent and used
 * both by the payout engine and by a "why did this deal split this way?" view:
 *
 *     given the rules, a client, a deal type, and a date — which split applies?
 *
 * Two ideas keep it honest:
 *
 *   1. MOST SPECIFIC WINS. A rule naming both the client and the deal type beats
 *      one naming only the client, which beats one naming only the deal type,
 *      which beats the blanket default. Ties on specificity go to the rule that
 *      took effect most recently, so a new override supersedes an old one.
 *   2. EFFECTIVE-DATED. A rule applies only on and after `effectiveFrom` and
 *      strictly before `effectiveTo` (open-ended when null). Asking for a past
 *      date returns the rule that was in force THEN, so history never rewrites.
 *
 * When nothing matches, the answer is the standing 50/50 — never an error and
 * never a guess, because the partnership default is a known fact.
 */

import { MoneyError } from "@/lib/money";
import { type Bps, TOTAL_BPS } from "@/lib/splits";

/** A split rule, shaped as plain data so this stays pure and testable. */
export interface SplitRule {
  /** Null = applies to any client. Set = only this client. */
  clientId: string | null;
  /** Null = applies to any deal type. Set = only this type. */
  dealType: string | null;
  danielBps: Bps;
  gusBps: Bps;
  effectiveFrom: Date;
  /** Null = still in force. */
  effectiveTo: Date | null;
}

export interface SplitQuery {
  clientId: string;
  dealType: string;
  /** The moment to evaluate the rules as of. Usually the deal's close date. */
  at: Date;
}

export interface ResolvedSplit {
  danielBps: Bps;
  gusBps: Bps;
}

/** The partnership default when no rule matches: an even split. */
export const DEFAULT_SPLIT: ResolvedSplit = {
  danielBps: TOTAL_BPS / 2,
  gusBps: TOTAL_BPS / 2,
};

function eq(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** How specific a rule is, higher wins: client+type > client > type > blanket. */
function specificity(rule: SplitRule): number {
  return (rule.clientId ? 2 : 0) + (rule.dealType ? 1 : 0);
}

function isInForce(rule: SplitRule, at: Date): boolean {
  if (at < rule.effectiveFrom) return false;
  if (rule.effectiveTo !== null && at >= rule.effectiveTo) return false;
  return true;
}

function matchesQuery(rule: SplitRule, query: SplitQuery): boolean {
  if (rule.clientId !== null && rule.clientId !== query.clientId) return false;
  if (rule.dealType !== null && !eq(rule.dealType, query.dealType)) return false;
  return isInForce(rule, query.at);
}

/**
 * Resolves the split for a deal. Never throws on a missing rule — it returns the
 * 50/50 default. It DOES throw if a rule that would be used is itself malformed
 * (its two shares do not sum to 100%), because applying such a rule would lose
 * or invent money, and a loud failure is safer than a wrong payout.
 */
export function resolvePartnerSplit(
  rules: readonly SplitRule[],
  query: SplitQuery,
): ResolvedSplit {
  const applicable = rules.filter((rule) => matchesQuery(rule, query));

  if (applicable.length === 0) {
    return DEFAULT_SPLIT;
  }

  // Most specific first; on a tie, the most recently effective rule.
  const [winner] = [...applicable].sort(
    (a, b) =>
      specificity(b) - specificity(a) ||
      b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
  );

  if (winner.danielBps + winner.gusBps !== TOTAL_BPS) {
    throw new MoneyError(
      `Split rule does not sum to 100% (${winner.danielBps} + ${winner.gusBps} bps). ` +
        `Applying it would lose or invent money; fix the rule before using it.`,
    );
  }

  return { danielBps: winner.danielBps, gusBps: winner.gusBps };
}
