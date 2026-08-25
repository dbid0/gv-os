import { type RevShareLine } from "@/lib/revshare/engine";

/**
 * A monthly rev-share statement for one client — the document GV sends: gross
 * cash their offer collected, processor fees, cash after fees, the locked rate,
 * and GV's share. Pure: the money-critical share number comes straight from the
 * tested rev-share engine (RevShareLine); this only adds the gross/fee context
 * for the client to read, so it can never disagree with the accounting page.
 */

export interface StatementRow {
  clientId: string | null;
  layer: string;
  direction: string;
  occurredOn: string;
  cashCents: number;
  processorFeeCents: number;
}

export interface RevShareStatement {
  clientId: string;
  clientName: string;
  month: string;
  grossCashCents: number;
  processorFeeCents: number;
  cashAfterFeesCents: number;
  /** Ad spend deducted before the rate (0 unless an after-ad-spend offer). */
  adSpendCents: number;
  /** cashAfterFees − adSpend — what the rate applies to. */
  basisCents: number;
  rateBps: number;
  revShareCents: number;
  dealCount: number;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-08" -> "August 2026". */
export function formatMonth(month: string): string {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return month;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/**
 * Build the statement for one client + month from the client-layer rows and the
 * engine's computed line. Gross/fee/count are derived from the rows; the after-
 * fees and share are taken from the line, never recomputed, so the statement
 * and the rev-share ledger are always the same number.
 */
export function buildRevShareStatement(
  rows: StatementRow[],
  line: RevShareLine,
  clientName: string,
): RevShareStatement {
  const mine = rows.filter(
    (r) =>
      r.layer === "client" &&
      r.direction === "in" &&
      r.clientId === line.clientId &&
      r.occurredOn.slice(0, 7) === line.month,
  );
  const grossCashCents = mine.reduce((s, r) => s + r.cashCents, 0);
  const processorFeeCents = mine.reduce((s, r) => s + r.processorFeeCents, 0);

  return {
    clientId: line.clientId,
    clientName,
    month: line.month,
    grossCashCents,
    processorFeeCents,
    cashAfterFeesCents: line.cashAfterFeesCents,
    adSpendCents: line.adSpendCents,
    basisCents: line.basisCents,
    rateBps: line.rateBps,
    revShareCents: line.revShareCents,
    dealCount: mine.length,
  };
}
