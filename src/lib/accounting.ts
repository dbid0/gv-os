import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, deals } from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";
import { type Cents, ZERO, cents } from "@/lib/money";

/**
 * The Accounting module's read layer.
 *
 * Everything here DERIVES from the append-only ledger — there is no stored
 * balance to drift, the same architecture the live Master Finance Sheet already
 * uses (immutable source rows + computed views). No hard finance figures are
 * copied into the app during the build; this only ever reflects the money the
 * app itself has recorded.
 */

export interface LedgerSummary {
  cashInCents: Cents;
  feesCents: Cents;
  payoutsCents: Cents;
  refundsCents: Cents;
  adjustmentsCents: Cents;
  netCents: Cents;
  eventCount: number;
}

export async function getLedgerSummary(): Promise<LedgerSummary> {
  const db = getDb();
  const rows = await db
    .select({
      type: moneyEvents.eventType,
      total: sql<number>`coalesce(sum(${moneyEvents.amountCents}), 0)`,
      n: sql<number>`count(*)`,
    })
    .from(moneyEvents)
    .groupBy(moneyEvents.eventType);

  const by = new Map(rows.map((r) => [r.type, cents(Number(r.total))]));
  const count = rows.reduce((s, r) => s + Number(r.n), 0);
  const get = (t: string) => by.get(t) ?? ZERO;

  const cashIn = get("payment_received");
  const fees = get("processor_fee");
  const payouts = get("payout");
  const refunds = get("refund");
  const adjustments = get("adjustment");

  return {
    cashInCents: cashIn,
    feesCents: fees,
    payoutsCents: payouts,
    refundsCents: refunds,
    adjustmentsCents: adjustments,
    // Signed amounts: money in is positive, fees/payouts/refunds negative, so
    // the net is a single honest sum, never a stored figure.
    netCents: cents(cashIn + fees + payouts + refunds + adjustments),
    eventCount: count,
  };
}

export interface LedgerEventRow {
  id: string;
  occurredAtISO: string;
  eventType: string;
  amountCents: Cents;
  teamName: string | null;
  customerName: string | null;
  source: string;
  memo: string | null;
}

export async function listLedgerEvents(limit = 100): Promise<LedgerEventRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: moneyEvents.id,
      occurredAt: moneyEvents.occurredAt,
      eventType: moneyEvents.eventType,
      amountCents: moneyEvents.amountCents,
      teamName: clients.name,
      customerName: deals.customerName,
      source: moneyEvents.source,
      memo: moneyEvents.memo,
    })
    .from(moneyEvents)
    .leftJoin(clients, eq(moneyEvents.clientId, clients.id))
    .leftJoin(deals, eq(moneyEvents.dealId, deals.id))
    .orderBy(desc(moneyEvents.occurredAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    occurredAtISO: r.occurredAt.toISOString(),
    eventType: r.eventType,
    amountCents: cents(r.amountCents),
    teamName: r.teamName,
    customerName: r.customerName,
    source: r.source,
    memo: r.memo,
  }));
}
