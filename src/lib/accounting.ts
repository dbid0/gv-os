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

/** One month's money, aggregated from the ledger. */
export interface MonthRow {
  month: string;
  label: string;
  cashInCents: Cents;
  feesCents: Cents;
  payoutsCents: Cents;
  netCents: Cents;
}

/**
 * Money by calendar month, newest first — the month-over-month view the finance
 * sheet lives on. Aggregated from the ledger; nothing stored, nothing invented.
 */
export async function getMonthlyFinance(): Promise<MonthRow[]> {
  const db = getDb();
  const monthExpr = sql<string>`to_char(${moneyEvents.occurredAt}, 'YYYY-MM')`;
  const rows = await db
    .select({
      month: monthExpr,
      type: moneyEvents.eventType,
      total: sql<number>`coalesce(sum(${moneyEvents.amountCents}), 0)`,
    })
    .from(moneyEvents)
    .groupBy(monthExpr, moneyEvents.eventType);

  const byMonth = new Map<string, MonthRow>();
  for (const r of rows) {
    const m = byMonth.get(r.month) ?? {
      month: r.month,
      label: monthLabel(r.month),
      cashInCents: ZERO,
      feesCents: ZERO,
      payoutsCents: ZERO,
      netCents: ZERO,
    };
    const amt = cents(Number(r.total));
    if (r.type === "payment_received") m.cashInCents = cents(m.cashInCents + amt);
    else if (r.type === "processor_fee") m.feesCents = cents(m.feesCents + amt);
    else if (r.type === "payout") m.payoutsCents = cents(m.payoutsCents + amt);
    m.netCents = cents(m.netCents + amt);
    byMonth.set(r.month, m);
  }

  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** One deal's accounts-receivable line: revenue agreed vs cash collected. */
export interface ReceivableRow {
  dealId: string;
  customerName: string | null;
  teamName: string | null;
  closedAtISO: string | null;
  revenueCents: Cents;
  cashCents: Cents;
  balanceDueCents: Cents;
}

export interface ReceivablesSummary {
  totalRevenueCents: Cents;
  totalCashCents: Cents;
  totalArCents: Cents;
  openCount: number;
  rows: ReceivableRow[];
}

/**
 * Accounts receivable: what has been agreed vs what has been collected.
 *
 * Balance due = max(revenue − cash collected, 0) per deal, the finance sheet's
 * own AR formula. Revenue is the deal's agreed value; cash is summed from the
 * ledger's payments — never a stored balance. Only deals still owed money are
 * listed; the totals cover the whole book.
 */
export async function getReceivables(): Promise<ReceivablesSummary> {
  const db = getDb();

  const dealRows = await db
    .select({
      id: deals.id,
      revenueCents: deals.contractValueCents,
      customerName: deals.customerName,
      teamName: clients.name,
      closedAt: deals.closedAt,
    })
    .from(deals)
    .leftJoin(clients, eq(deals.clientId, clients.id))
    .orderBy(desc(deals.closedAt));

  const cashRows = await db
    .select({
      dealId: moneyEvents.dealId,
      total: sql<number>`coalesce(sum(${moneyEvents.amountCents}), 0)`,
    })
    .from(moneyEvents)
    .where(eq(moneyEvents.eventType, "payment_received"))
    .groupBy(moneyEvents.dealId);
  const cashByDeal = new Map<string, Cents>();
  for (const r of cashRows) {
    if (r.dealId) cashByDeal.set(r.dealId, cents(Number(r.total)));
  }

  const rows: ReceivableRow[] = [];
  let totalRevenue = ZERO;
  let totalCash = ZERO;
  let totalAr = ZERO;

  for (const d of dealRows) {
    const revenue = cents(d.revenueCents);
    const cash = cashByDeal.get(d.id) ?? ZERO;
    const balance = cents(Math.max(revenue - cash, 0));
    totalRevenue = cents(totalRevenue + revenue);
    totalCash = cents(totalCash + cash);
    totalAr = cents(totalAr + balance);
    if (balance > 0) {
      rows.push({
        dealId: d.id,
        customerName: d.customerName,
        teamName: d.teamName,
        closedAtISO: d.closedAt ? d.closedAt.toISOString() : null,
        revenueCents: revenue,
        cashCents: cash,
        balanceDueCents: balance,
      });
    }
  }

  return {
    totalRevenueCents: totalRevenue,
    totalCashCents: totalCash,
    totalArCents: totalAr,
    openCount: rows.length,
    rows,
  };
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
