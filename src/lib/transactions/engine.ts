import { sheetFeeCents } from "@/lib/accounting/sheet-mirror";

/**
 * v2 transaction engine — pure, money-critical, 100% covered. Builds
 * backlog rows from their sources; the processor-fee math IS the proven
 * sheet formula (sheetFeeCents), never a re-implementation.
 */

export const DEAL_TYPES = [
  "Setup",
  "DWY Build",
  "DFY Build",
  "Retainer",
  "Rev-Share",
  "Client Handoff",
  "Other",
] as const;

export const PAYMENT_METHODS = [
  "Wire",
  "ACH",
  "Fanbasis",
  "Stripe",
  "Shopify Affirm",
  "Whop",
  "Payva",
  "PayPal",
  "Crypto",
  "Card",
  "Other",
] as const;

/** Processor fee for a manual/form entry: the sheet formula, override wins. */
export function autoProcessorFeeCents(
  cashCents: number,
  paymentMethod: string,
  overrideCents: number | null = null,
): number {
  return sheetFeeCents(cashCents, paymentMethod, overrideCents);
}

/** The sheet fields a backlog row is built from. MirrorDealInput satisfies
 * this; so does a row read back from sheet_mirror_deals. */
export interface SheetDealFields {
  dateClosed: string;
  client: string;
  dealType: string;
  method: string;
  revenueCents: number;
  cashCents: number;
  notes: string;
}

export interface SheetDealRow {
  input: SheetDealFields;
  ours: { feeCents: number };
}

/**
 * Content-keyed identity for a sheet deal. Deliberately NOT the row index —
 * a row inserted mid-sheet must not shift every identity below it and
 * double-import history. Identical rows (same day, client, type, amounts)
 * get an occurrence counter so true duplicates stay distinct AND stable.
 */
export function sheetIdempotencyKey(
  input: SheetDealFields,
  occurrence: number,
): string {
  const parts = [
    "sheet",
    input.dateClosed.trim(),
    input.client.trim().toLowerCase(),
    input.dealType.trim().toLowerCase(),
    String(input.revenueCents),
    String(input.cashCents),
    String(occurrence),
  ];
  return parts.join("|");
}

export interface BacklogRow {
  occurredOn: string;
  direction: "in" | "out";
  layer: "agency" | "client";
  dealType: string;
  description: string;
  paymentMethod: string;
  revenueCents: number;
  cashCents: number;
  processorFeeCents: number;
  source: "sheet";
  idempotencyKey: string;
  notes: string | null;
}

/**
 * A Master-Finance-Sheet deal as a backlog row: the agency book, money in.
 * The fee is OUR penny-exact recompute (the verified engine), not the
 * sheet's own cell.
 */
export function sheetDealToTransaction(
  deal: SheetDealRow,
  occurrence: number,
): BacklogRow {
  return {
    occurredOn: deal.input.dateClosed.trim(),
    direction: "in",
    layer: "agency",
    dealType: deal.input.dealType.trim(),
    description: deal.input.client.trim(),
    paymentMethod: deal.input.method.trim(),
    revenueCents: deal.input.revenueCents,
    cashCents: deal.input.cashCents,
    processorFeeCents: deal.ours.feeCents,
    source: "sheet",
    idempotencyKey: sheetIdempotencyKey(deal.input, occurrence),
    notes: deal.input.notes.trim() ? deal.input.notes.trim() : null,
  };
}

/**
 * Build the whole import set with per-content occurrence counters. Order-
 * independent identity: sorting or inserting rows in the sheet never changes
 * which backlog rows exist.
 */
export function buildSheetImport(deals: SheetDealRow[]): BacklogRow[] {
  const seen = new Map<string, number>();
  return deals.map((deal) => {
    const base = sheetIdempotencyKey(deal.input, 0);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return sheetDealToTransaction(deal, occurrence);
  });
}
