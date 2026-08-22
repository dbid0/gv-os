/**
 * Rev-share engine (v2 §4) — pure, money-critical, 100% covered.
 *
 * GV's rev-share = (client-layer cash AFTER processing fees) × the client's
 * effective rate for that day. Sheet rows are the AGENCY book and never
 * enter this computation; only client-layer income does. Rep commissions
 * are excluded by construction — they never become client-layer rows.
 */

export interface RevShareRuleInput {
  clientId: string;
  rateBps: number;
  /** yyyy-mm-dd, applies from this day forward. */
  effectiveFrom: string;
}

export interface ClientCashRow {
  clientId: string | null;
  direction: string;
  layer: string;
  /** yyyy-mm-dd business day. */
  occurredOn: string;
  cashCents: number;
  processorFeeCents: number;
}

/** The newest rule effective on or before the day; null = no rev-share. */
export function rateBpsFor(
  rules: RevShareRuleInput[],
  clientId: string,
  day: string,
): number | null {
  const applicable = rules
    .filter((r) => r.clientId === clientId && r.effectiveFrom <= day)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return applicable.length > 0 ? applicable[0].rateBps : null;
}

export interface RevShareLine {
  clientId: string;
  /** yyyy-mm. */
  month: string;
  cashAfterFeesCents: number;
  rateBps: number;
  revShareCents: number;
}

/**
 * Monthly pending rev-share per client. Each row is rated by ITS day (a
 * mid-month rate change rates each side correctly), then summed by month.
 * Rounding happens per row, half-up — deterministic and replayable.
 */
export function revShareLines(
  rows: ClientCashRow[],
  rules: RevShareRuleInput[],
): RevShareLine[] {
  const buckets = new Map<
    string,
    { clientId: string; month: string; afterFees: number; share: number; rate: number }
  >();
  for (const r of rows) {
    if (r.layer !== "client" || r.direction !== "in" || !r.clientId) continue;
    const rate = rateBpsFor(rules, r.clientId, r.occurredOn);
    if (rate === null) continue;
    const afterFees = r.cashCents - r.processorFeeCents;
    const share = Math.round((afterFees * rate) / 10_000);
    const month = r.occurredOn.slice(0, 7);
    const key = `${r.clientId}:${month}`;
    const bucket = buckets.get(key) ?? {
      clientId: r.clientId,
      month,
      afterFees: 0,
      share: 0,
      rate,
    };
    bucket.afterFees += afterFees;
    bucket.share += share;
    bucket.rate = rate;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .map((b) => ({
      clientId: b.clientId,
      month: b.month,
      cashAfterFeesCents: b.afterFees,
      rateBps: b.rate,
      revShareCents: b.share,
    }))
    .sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0));
}
