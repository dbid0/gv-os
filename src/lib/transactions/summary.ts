/**
 * SUMMING A LEDGER VIEW.
 *
 * Money in and money out are different directions, and adding them together
 * is not a total of anything. The backlog KPIs used to sum `cash_cents` across
 * every row on screen and label the result "Cash collected" — so twenty-seven
 * expense rows added $17,535 of money LEAVING to a figure meaning money
 * arriving, and the page reported $808,001 where $790,466 came in.
 *
 * Direction is respected here, once, in a pure function the page cannot
 * bypass. Revenue is an income concept and only ever counts inbound rows;
 * an expense has no revenue to book.
 */

export interface DirectionalRow {
  /**
   * "in" or "out". Typed as a string because that is what the column is —
   * and a value that is neither is counted apart rather than guessed at.
   */
  direction: string;
  revenueCents: number;
  cashCents: number;
  processorFeeCents: number;
}

export interface BacklogTotals {
  /** Booked revenue on inbound rows. Outbound rows carry none. */
  revenueCents: number;
  /** Cash that arrived. */
  cashInCents: number;
  /** Cash that left — expenses, payouts, refunds. A positive number. */
  cashOutCents: number;
  /** In minus out. */
  netCents: number;
  processorFeeCents: number;
  rowsIn: number;
  rowsOut: number;
  /**
   * Rows whose direction is neither "in" nor "out".
   *
   * Excluded from every figure above. A row nobody can classify must not be
   * quietly counted as income — that is how a bad import turns into revenue —
   * and must not silently vanish either, so it is surfaced as a count.
   */
  rowsUnknown: number;
}

export function summarizeBacklog(rows: DirectionalRow[]): BacklogTotals {
  const totals: BacklogTotals = {
    revenueCents: 0,
    cashInCents: 0,
    cashOutCents: 0,
    netCents: 0,
    processorFeeCents: 0,
    rowsIn: 0,
    rowsOut: 0,
    rowsUnknown: 0,
  };

  for (const row of rows) {
    if (row.direction !== "in" && row.direction !== "out") {
      totals.rowsUnknown += 1;
      continue;
    }
    totals.processorFeeCents += row.processorFeeCents;
    if (row.direction === "out") {
      totals.rowsOut += 1;
      // Stored as a positive magnitude on an outbound row; the direction is
      // what makes it negative, not the sign of the number.
      totals.cashOutCents += Math.abs(row.cashCents);
      continue;
    }
    totals.rowsIn += 1;
    totals.revenueCents += row.revenueCents;
    totals.cashInCents += row.cashCents;
  }
  totals.netCents = totals.cashInCents - totals.cashOutCents;
  return totals;
}
