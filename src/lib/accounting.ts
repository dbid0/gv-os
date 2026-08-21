import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, deals, partnerSplits } from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";
import { resolveSplit, type SplitRule } from "@/lib/accounting/split-rules";
import { type Cents, ZERO, cents } from "@/lib/money";
import { type Bps, allocatePair } from "@/lib/splits";

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

/** One deal's partner split: net cash allocated between Daniel and Gus. */
export interface PartnerPayoutRow {
  dealId: string;
  customerName: string | null;
  teamName: string | null;
  closedAtISO: string | null;
  netCents: Cents;
  danielCents: Cents;
  gusCents: Cents;
  danielPct: number;
  unresolved: boolean;
}

export interface PartnerPayoutSummary {
  danielCents: Cents;
  gusCents: Cents;
  netCents: Cents;
  unresolvedCount: number;
  hasRules: boolean;
  rows: PartnerPayoutRow[];
}

/**
 * The Daniel/Gus split, per deal and in total.
 *
 * Net cash (payments minus processor fees and refunds — rep payouts are a
 * separate layer) is resolved to an effective-dated split rule and allocated
 * penny-exact, Gus = Net − Daniel, so the two shares always sum to the net. A
 * deal with no applicable rule is FLAGGED, never guessed at 50/50.
 */
export async function getPartnerPayouts(): Promise<PartnerPayoutSummary> {
  const db = getDb();

  const dealRows = await db
    .select({
      id: deals.id,
      clientId: deals.clientId,
      dealType: deals.dealType,
      customerName: deals.customerName,
      teamName: clients.name,
      closedAt: deals.closedAt,
    })
    .from(deals)
    .leftJoin(clients, eq(deals.clientId, clients.id));

  // Net cash per deal: everything but rep payouts, signed.
  const evRows = await db
    .select({
      dealId: moneyEvents.dealId,
      total: sql<number>`coalesce(sum(${moneyEvents.amountCents}), 0)`,
    })
    .from(moneyEvents)
    .where(
      inArray(moneyEvents.eventType, ["payment_received", "processor_fee", "refund"]),
    )
    .groupBy(moneyEvents.dealId);
  const netByDeal = new Map<string, Cents>();
  for (const r of evRows) {
    if (r.dealId) netByDeal.set(r.dealId, cents(Number(r.total)));
  }

  const ruleRows = await db.select().from(partnerSplits);
  const rules: SplitRule[] = ruleRows.map((r) => ({
    clientId: r.clientId,
    dealType: r.dealType,
    danielBps: r.danielBps as Bps,
    gusBps: r.gusBps as Bps,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
  }));

  const rows: PartnerPayoutRow[] = [];
  let danielTotal = ZERO;
  let gusTotal = ZERO;
  let netTotal = ZERO;
  let unresolvedCount = 0;

  for (const d of dealRows) {
    const net = netByDeal.get(d.id) ?? ZERO;
    if (net <= 0) continue;
    netTotal = cents(netTotal + net);

    const base = {
      dealId: d.id,
      customerName: d.customerName,
      teamName: d.teamName,
      closedAtISO: d.closedAt ? d.closedAt.toISOString() : null,
      netCents: net,
    };

    try {
      const { danielBps } = resolveSplit(rules, {
        clientId: d.clientId,
        dealType: d.dealType,
        on: d.closedAt ?? new Date(),
      });
      const { first: daniel, second: gus } = allocatePair(net, danielBps);
      danielTotal = cents(danielTotal + daniel);
      gusTotal = cents(gusTotal + gus);
      rows.push({
        ...base,
        danielCents: daniel,
        gusCents: gus,
        danielPct: danielBps / 100,
        unresolved: false,
      });
    } catch {
      unresolvedCount += 1;
      rows.push({
        ...base,
        danielCents: ZERO,
        gusCents: ZERO,
        danielPct: 0,
        unresolved: true,
      });
    }
  }

  return {
    danielCents: danielTotal,
    gusCents: gusTotal,
    netCents: netTotal,
    unresolvedCount,
    hasRules: rules.length > 0,
    rows,
  };
}
