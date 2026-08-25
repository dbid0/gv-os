/**
 * Ad-spend rollups — pure, so the number that will reduce a rev-share basis is
 * testable to the cent. Ad spend is bucketed by client + month; a "X% after ad
 * spend" offer rates on (cash after fees − that month's ad spend).
 */

export interface AdSpendRow {
  clientId: string;
  occurredOn: string; // yyyy-mm-dd
  amountCents: number;
}

/** clientId:yyyy-mm → total ad-spend cents for that offer-month. */
export function adSpendByClientMonth(rows: AdSpendRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.clientId}:${r.occurredOn.slice(0, 7)}`;
    map.set(key, (map.get(key) ?? 0) + r.amountCents);
  }
  return map;
}

/** Total ad spend across the given rows. */
export function adSpendTotalCents(rows: AdSpendRow[]): number {
  return rows.reduce((s, r) => s + r.amountCents, 0);
}

/**
 * The rev-share basis after deducting a month's ad spend — never below zero, so
 * a month whose ad spend exceeds its collected cash owes no rev-share rather
 * than a negative one.
 */
export function basisAfterAdSpend(
  cashAfterFeesCents: number,
  adSpendCents: number,
): number {
  return Math.max(0, cashAfterFeesCents - adSpendCents);
}
