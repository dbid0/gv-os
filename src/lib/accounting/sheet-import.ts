/**
 * Reading the Master Finance Sheet's Raw Data into GV OS shapes.
 *
 * This is the Phase-A mirror's translation layer, and only its translation:
 * pure functions that turn one Raw Data row into the `deal` and `money_events`
 * it represents. No network, no database, no writing back — the sheet stays the
 * system of record. The actual import wires these outputs into an idempotent
 * upsert; this file is the part that can be tested to the cent against known
 * rows.
 *
 * The columns, read live from the sheet on 2026-08-18:
 *
 *   A Timestamp · B Date Closed · C Client / Brand · D Deal Type ·
 *   E Offer / Package · F Revenue (total contract $) · G Cash Collected today $ ·
 *   H Payment Method · I Daniel's Payout % · J Processor Fee $ (optional) ·
 *   K Agreement Signed? · L Notes · M Payout Status
 *
 * Money arrives as strings and is parsed with `fromDollars` (string math, so no
 * float ever touches a cent). The split follows the sheet's own rule via
 * `resolveDanielBps`, and is stored as a per-deal override only when it differs
 * from the standing 50/50 — history stays faithful, new deals stay clean.
 */

import { fromDollars, type Cents, MoneyError } from "@/lib/money";
import { TOTAL_BPS } from "@/lib/splits";
import { resolveDanielBps } from "@/lib/accounting/payout";

/** One Raw Data row, by meaning rather than by column letter. */
export interface RawDataRow {
  timestamp: string;
  dateClosed: string;
  clientBrand: string;
  dealType: string;
  offer: string;
  revenue: string;
  cashCollected: string;
  paymentMethod: string;
  danielPercent: string;
  processorFeeOverride: string;
  agreementSigned: string;
  notes: string;
  payoutStatus: string;
}

export const RAW_DATA_COLUMN_COUNT = 13;

/** Builds a row from a sheet's cell array, tolerating trailing-empty short rows. */
export function rowFromCells(cells: readonly unknown[]): RawDataRow {
  const at = (i: number): string => (cells[i] == null ? "" : String(cells[i]));
  return {
    timestamp: at(0),
    dateClosed: at(1),
    clientBrand: at(2),
    dealType: at(3),
    offer: at(4),
    revenue: at(5),
    cashCollected: at(6),
    paymentMethod: at(7),
    danielPercent: at(8),
    processorFeeOverride: at(9),
    agreementSigned: at(10),
    notes: at(11),
    payoutStatus: at(12),
  };
}

export interface MappedDeal {
  /** Stable identity for the source row; makes the import idempotent. */
  externalRef: string;
  clientName: string;
  dealType: string;
  offer: string | null;
  contractValueCents: Cents;
  /** Null = the standing 50/50; a value = a faithful historical override. */
  danielBps: number | null;
  agreementSigned: string | null;
  closedAt: string;
  notes: string | null;
}

export interface MappedEvent {
  /** Idempotency key for this event; a re-import cannot double-count it. */
  externalRef: string;
  eventType: string;
  amountCents: Cents;
  processor: string;
  /** A manual fee from column J, else null to compute by method. */
  feeOverrideCents: Cents | null;
  occurredAt: string;
}

export interface MappedRow {
  deal: MappedDeal;
  events: MappedEvent[];
}

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** True for a row with no timestamp and no client — a blank spacer, not a deal. */
export function isBlankRow(row: RawDataRow): boolean {
  return row.timestamp.trim() === "" && row.clientBrand.trim() === "";
}

/**
 * Maps one Raw Data row to the deal and events it represents.
 *
 * Throws on a row that is present but unusable (no timestamp to key on, a
 * malformed dollar amount, a percentage that is not a whole basis point), so a
 * bad source row fails loudly at import rather than mirroring wrong figures.
 */
export function mapRawRow(row: RawDataRow): MappedRow {
  const key = row.timestamp.trim();
  if (key === "") {
    throw new MoneyError(
      "Raw Data row has no Timestamp to key on; cannot import it idempotently.",
    );
  }

  const percentText = row.danielPercent.trim();
  const resolvedBps = resolveDanielBps(
    row.dealType,
    percentText === "" ? null : Number(percentText),
  );
  // Store an override only when it differs from the standing rule.
  const danielBps = resolvedBps === TOTAL_BPS / 2 ? null : resolvedBps;

  const closedAt = row.dateClosed.trim() || key;

  const deal: MappedDeal = {
    externalRef: `sheet:${key}`,
    clientName: row.clientBrand.trim(),
    dealType: row.dealType.trim(),
    offer: optional(row.offer),
    contractValueCents: fromDollars(row.revenue),
    danielBps,
    agreementSigned: optional(row.agreementSigned),
    closedAt,
    notes: optional(row.notes),
  };

  const events: MappedEvent[] = [];
  const cashText = row.cashCollected.trim();
  if (cashText !== "") {
    const amountCents = fromDollars(cashText);
    if (amountCents !== 0) {
      const feeText = row.processorFeeOverride.trim();
      events.push({
        externalRef: `sheet:${key}:payment`,
        eventType: "payment_received",
        amountCents,
        processor: row.paymentMethod.trim().toLowerCase(),
        feeOverrideCents: feeText === "" ? null : fromDollars(feeText),
        occurredAt: closedAt,
      });
    }
  }

  return { deal, events };
}
