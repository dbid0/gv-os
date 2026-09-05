/**
 * GUARDING THE FINANCE SHEET AGAINST A DOUBLE-LOGGED DEAL.
 *
 * "Log a deal" appends to the Master Finance Sheet, which is the system of
 * record: the mirror reads it back, rev-share is computed from it, and the
 * partner split follows from that. A row logged twice therefore does not just
 * look wrong on one screen — it inflates GV's revenue, its rev-share owed and
 * both partners' distributions, and it is invisible unless someone happens to
 * scroll the sheet.
 *
 * The form already disables its button while submitting, which stops a
 * double-click. It does nothing about the case that actually happens: a
 * request that succeeded but looked like it failed — a timeout, a dropped
 * connection, a closed laptop — and the person logs it again.
 *
 * So the same deal is recognised before appending. Identity is the fields a
 * person would have to retype identically: client, date closed, deal type,
 * revenue and cash. Not the timestamp, which differs by design on a retry.
 */

/** The columns of a Raw Data row this check reads. Matches financeRawRow. */
export interface RawDealRow {
  /** Column B — the date the deal closed. */
  dateClosed: string;
  /** Column C. */
  client: string;
  /** Column D. */
  dealType: string;
  /** Column F, as written to the sheet. */
  revenue: string;
  /** Column G, as written to the sheet. */
  cash: string;
}

export interface DealIdentity {
  dateClosed: string;
  client: string;
  dealType: string;
  revenueCents: number;
  cashCents: number;
}

/** Read a Raw Data row (A..M) into the fields identity is judged on. */
export function rawDealRow(row: string[]): RawDealRow {
  return {
    dateClosed: row[1] ?? "",
    client: row[2] ?? "",
    dealType: row[3] ?? "",
    revenue: row[5] ?? "",
    cash: row[6] ?? "",
  };
}

/** Money as the sheet holds it — "$7,500.00", "7500", "7,500" all match. */
function moneyCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Is this row the same deal?
 *
 * Every identity field must match, and both money fields must PARSE. A row
 * whose amount cannot be read is not treated as a match — refusing to log real
 * money because of an unreadable neighbouring row would be the worse failure.
 */
export function isSameDeal(row: RawDealRow, deal: DealIdentity): boolean {
  if (norm(row.client) !== norm(deal.client)) return false;
  if (norm(row.dateClosed) !== norm(deal.dateClosed)) return false;
  if (norm(row.dealType) !== norm(deal.dealType)) return false;
  const revenue = moneyCents(row.revenue);
  const cash = moneyCents(row.cash);
  if (revenue === null || cash === null) return false;
  return revenue === deal.revenueCents && cash === deal.cashCents;
}

/**
 * The 1-based Raw Data row number of an identical deal, or null.
 *
 * `rows` are the Raw Data rows starting at sheet row 2, in sheet order. The
 * row NUMBER is returned rather than a boolean so the warning can point at the
 * exact line: "row 41 already has this deal" is checkable, "this looks like a
 * duplicate" is not.
 */
export function findDuplicateDeal(
  rows: string[][],
  deal: DealIdentity,
  firstSheetRow = 2,
): number | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (isSameDeal(rawDealRow(rows[i]), deal)) return firstSheetRow + i;
  }
  return null;
}

/* ------------------------------------------------------------------------ *
 * The same guard for deals logged INSIDE GV OS.
 *
 * A rep logging their own sale writes a `deals` row plus append-only ledger
 * events. The idempotency key on those events is derived from the freshly
 * created deal id, so it protects a REPLAY of one record and does nothing
 * about two records for one real sale — the exact gap the finance sheet had.
 * Correcting it afterwards is harder here, because the ledger is append-only
 * and a mistake has to be reversed rather than deleted.
 * ------------------------------------------------------------------------ */

export interface LoggedDeal {
  clientId: string;
  customerName: string | null;
  dealType: string | null;
  /**
   * Cents — typed as number but accepted as a string too.
   *
   * These columns are `bigint` in Postgres. Drizzle maps them with
   * `mode: "number"`, but a driver reading the same column directly hands back
   * a STRING, and `"750000" !== 750000` fails silently: the guard finds no
   * duplicate and the deal is written twice. Comparing numerically means the
   * check cannot be broken by a change in how the row was fetched.
   */
  contractValueCents: number | string;
  cashCents: number | string;
  closedAt: Date | null;
}

export interface LoggedDealIdentity {
  clientId: string;
  customerName: string | null;
  dealType: string;
  contractValueCents: number;
  cashCents: number;
}

/**
 * Two cent amounts, compared as numbers whichever way they arrived.
 *
 * Returns false when either side is unreadable — an amount nobody can parse is
 * not evidence of a duplicate, and blocking a real deal over it would be the
 * worse failure.
 */
export function sameCents(a: number | string, b: number | string): boolean {
  const x = typeof a === "number" ? a : Number(a);
  const y = typeof b === "number" ? b : Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x === y;
}

/** How recently an identical deal counts as the same one being logged twice. */
export const DEAL_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * An identical deal on the same offer, logged within the window.
 *
 * A customer name is part of identity when BOTH sides have one. Two unnamed
 * deals of the same size on the same day are still treated as the same sale —
 * that is the shape a double-submit takes, since the form was filled once.
 */
export function findRecentDuplicateDeal(
  existing: LoggedDeal[],
  deal: LoggedDealIdentity,
  now: Date,
  windowMs = DEAL_DUPLICATE_WINDOW_MS,
): LoggedDeal | null {
  return (
    existing.find((row) => {
      if (row.clientId !== deal.clientId) return false;
      if (!sameCents(row.contractValueCents, deal.contractValueCents)) return false;
      if (!sameCents(row.cashCents, deal.cashCents)) return false;
      if (norm(row.dealType ?? "") !== norm(deal.dealType)) return false;
      const a = row.customerName?.trim();
      const b = deal.customerName?.trim();
      if (a && b && norm(a) !== norm(b)) return false;
      if (!row.closedAt) return false;
      // Distance, not age. Two clocks are involved — the deal is stamped by
      // the DATABASE and the window is measured against the APP's clock — so a
      // row inserted a millisecond ago can read as microseconds in the future
      // and an "age >= 0" test rejects the very duplicate it exists to catch.
      // A deal deliberately dated ahead is a duplicate on the same reasoning.
      return Math.abs(now.getTime() - row.closedAt.getTime()) <= windowMs;
    }) ?? null
  );
}
