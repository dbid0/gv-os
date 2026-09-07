/**
 * ONE ROW PER CHARGE.
 *
 * A hand-kept payment log repeats itself: the same transaction pasted twice,
 * a webhook that fired twice, a correction typed as a second line. On a real
 * sheet this was four duplicate transaction ids quietly double-counting
 * thousands of dollars — invisible, because the total still looked plausible.
 *
 * The transaction id is the processor's own idempotency key, so it is the
 * dedupe key here: rows sharing one count ONCE (the first kept). Rows with no
 * id are kept as-is — merging them would be guessing, and dropping a
 * legitimate cash row is worse than tolerating a duplicate we cannot prove.
 *
 * Pure: no clock, no database.
 */

/** The minimal shape dedupe needs — every tracking-row variant satisfies it. */
export interface Paymentish {
  tab: string;
  payload: Record<string, string> | null;
}

/** The payload key that holds the processor's transaction id, if any. */
function transactionIdOf(row: Paymentish): string | null {
  for (const [key, value] of Object.entries(row.payload ?? {})) {
    if (!/transaction|txn/i.test(key)) continue;
    const v = value?.trim();
    if (v) return v;
  }
  return null;
}

/** Payment rows with duplicate transaction ids collapsed to their first row. */
export function dedupePaymentRows<T extends Paymentish>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (row.tab !== "payments") {
      out.push(row);
      continue;
    }
    const id = transactionIdOf(row);
    if (id === null) {
      out.push(row);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}
