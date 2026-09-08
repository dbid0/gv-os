/**
 * HOW THE CLOSES PAID — paid in full, split pay, or deposit.
 *
 * The same "closed" can be three different cash realities. The MONEY SHAPE
 * decides first — an explicit label only sharpens it:
 *
 *   • an explicit deposit label → DEPOSIT (a toe-hold, not a close-out)
 *   • an explicit plan/split label, or cash < revenue → SPLIT PAY
 *   • cash covering revenue → PAID IN FULL
 *   • no cash and no revenue on the row → UNKNOWN, shown as such
 *
 * Pure: no clock, no database.
 */

export interface CloseRow {
  cashCents: number | null;
  revenueCents: number | null;
  /** The sheet's own wording for the deal/close type, if any. */
  label: string | null;
}

export type ClosePaidKind = "pif" | "split" | "deposit" | "unknown";

export interface ClosesPaid {
  pif: number;
  split: number;
  deposit: number;
  unknown: number;
  pifCents: number;
  splitCents: number;
  depositCents: number;
}

const DEPOSIT = /deposit/i;
const SPLIT = /payment\s*plan|split|installment|instalment/i;

export function classifyClose(row: CloseRow): ClosePaidKind {
  const label = row.label ?? "";
  if (DEPOSIT.test(label)) return "deposit";
  if (SPLIT.test(label)) return "split";
  const cash = row.cashCents ?? 0;
  const revenue = row.revenueCents ?? 0;
  if (cash <= 0 && revenue <= 0) return "unknown";
  if (revenue > cash) return "split";
  return "pif";
}

export function closesPaid(rows: CloseRow[]): ClosesPaid {
  const out: ClosesPaid = {
    pif: 0,
    split: 0,
    deposit: 0,
    unknown: 0,
    pifCents: 0,
    splitCents: 0,
    depositCents: 0,
  };
  for (const row of rows) {
    const cash = Math.abs(row.cashCents ?? 0);
    switch (classifyClose(row)) {
      case "deposit":
        out.deposit += 1;
        out.depositCents += cash;
        break;
      case "split":
        out.split += 1;
        out.splitCents += cash;
        break;
      case "pif":
        out.pif += 1;
        out.pifCents += cash;
        break;
      default:
        out.unknown += 1;
    }
  }
  return out;
}
