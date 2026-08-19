/**
 * Deciding which partner split applies to a deal.
 *
 * Splits live in app.partner_splits as effective-dated rows, not as constants,
 * so a rule change is data and history is never retroactively rewritten. This
 * is the resolver that turns that table into a single answer for one deal.
 *
 * Precedence, most specific first:
 *   1. a rule for THIS client AND this deal type
 *   2. a rule for THIS client, any deal type
 *   3. a rule for this deal type, any client
 *   4. the global default (no client, no deal type)
 * Within a tier, the rule in effect on the deal's date wins; if several overlap,
 * the one that took effect most recently does.
 *
 * A missing rule is an ERROR, never a guessed 50/50. Silently defaulting a split
 * is how money quietly goes to the wrong partner. The caller must handle it.
 */

import { type Bps, TOTAL_BPS } from "@/lib/splits";

export type SplitRule = {
  clientId: string | null;
  dealType: string | null;
  danielBps: Bps;
  gusBps: Bps;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export class SplitRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitRuleError";
  }
}

function isEffective(rule: SplitRule, on: Date): boolean {
  if (rule.effectiveFrom.getTime() > on.getTime()) return false;
  if (rule.effectiveTo && rule.effectiveTo.getTime() <= on.getTime()) return false;
  return true;
}

/** 0 = global, 1 = deal-type, 2 = client, 3 = client + deal-type. Higher wins. */
function specificity(rule: SplitRule): number {
  return (rule.clientId ? 2 : 0) + (rule.dealType ? 1 : 0);
}

/**
 * Resolve the split for one deal. Throws SplitRuleError if nothing matches,
 * because a deal with no applicable split rule is a gap to fix, not a number to
 * invent.
 */
export function resolveSplit(
  rules: SplitRule[],
  deal: { clientId: string; dealType: string; on: Date },
): { danielBps: Bps; gusBps: Bps; rule: SplitRule } {
  const candidates = rules.filter((rule) => {
    if (rule.clientId !== null && rule.clientId !== deal.clientId) return false;
    if (rule.dealType !== null && rule.dealType !== deal.dealType) return false;
    return isEffective(rule, deal.on);
  });

  if (candidates.length === 0) {
    throw new SplitRuleError(
      `No partner split rule applies to deal (client ${deal.clientId}, type ${deal.dealType}) on ${deal.on.toISOString()}. Add a rule rather than assuming a split.`,
    );
  }

  candidates.sort((a, b) => {
    const bySpecificity = specificity(b) - specificity(a);
    if (bySpecificity !== 0) return bySpecificity;
    // Same specificity: the more recently effective rule wins.
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  });

  const rule = candidates[0];

  // A stored rule that does not sum to 100% is corrupt data, not a valid split.
  if (rule.danielBps + rule.gusBps !== TOTAL_BPS) {
    throw new SplitRuleError(
      `Split rule is corrupt: ${rule.danielBps} + ${rule.gusBps} basis points does not equal ${TOTAL_BPS}.`,
    );
  }

  return { danielBps: rule.danielBps, gusBps: rule.gusBps, rule };
}

/** The standing 50/50, as a rule value. The default the business runs on today. */
export const FIFTY_FIFTY = { danielBps: 5000, gusBps: 5000 };
