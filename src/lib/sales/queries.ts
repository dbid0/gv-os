import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  type EodCalcField,
  type EodCustomField,
  clients,
  commissionSplits,
  deals,
  eodTemplates,
  reps,
} from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";
import { type Cents, ZERO, cents, sum } from "@/lib/money";
import { type Bps } from "@/lib/splits";
import { type CommissionBasis } from "@/lib/sales/commission";
import { type CommissionRollup } from "@/lib/sales/commission-rollup";
import { type CashByDeal, rollupFromRows } from "@/lib/sales/rollup-adapter";

/**
 * The Sales module's read layer.
 *
 * Server-only functions that pull real rows and run them through the tested
 * commission engine. Nothing here invents a number: cash collected is summed
 * from the ledger, revenue is the deal's agreed value, and the rollup is the
 * same pure code covered to the cent. A page shows whatever the database holds
 * — real rows or an honest empty state.
 */

/** Teams are client brands. */
export async function listTeams() {
  const db = getDb();
  return db
    .select()
    .from(clients)
    .where(eq(clients.status, "active"))
    .orderBy(clients.name);
}

export async function listReps(clientId?: string) {
  const db = getDb();
  const base = db.select().from(reps);
  const rows = clientId ? await base.where(eq(reps.clientId, clientId)) : await base;
  return rows;
}

/** Cash collected per deal, summed from the ledger's payment_received events. */
async function cashByDeal(dealIds: string[]): Promise<CashByDeal> {
  const map = new Map<string, Cents>();
  if (dealIds.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({
      dealId: moneyEvents.dealId,
      total: sql<number>`coalesce(sum(${moneyEvents.amountCents}), 0)`,
    })
    .from(moneyEvents)
    .where(
      and(
        inArray(moneyEvents.dealId, dealIds),
        eq(moneyEvents.eventType, "payment_received"),
      ),
    )
    .groupBy(moneyEvents.dealId);
  for (const r of rows) {
    if (r.dealId) map.set(r.dealId, cents(Number(r.total)));
  }
  return map;
}

/** A closed-deal row shaped for the Deals ledger view. */
export interface DealListRow {
  id: string;
  closedAt: Date | null;
  customerName: string | null;
  repName: string | null;
  teamName: string | null;
  source: string | null;
  recurrence: string | null;
  revenueCents: Cents;
  cashCollectedCents: Cents;
  status: string;
}

export async function listDeals(): Promise<DealListRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: deals.id,
      closedAt: deals.closedAt,
      customerName: deals.customerName,
      repName: reps.name,
      teamName: clients.name,
      source: deals.source,
      recurrence: deals.recurrence,
      revenueCents: deals.contractValueCents,
      agreementSigned: deals.agreementSigned,
    })
    .from(deals)
    .leftJoin(reps, eq(deals.repId, reps.id))
    .leftJoin(clients, eq(deals.clientId, clients.id))
    .orderBy(desc(deals.closedAt));

  const cash = await cashByDeal(rows.map((r) => r.id));

  return rows.map((r) => ({
    id: r.id,
    closedAt: r.closedAt,
    customerName: r.customerName,
    repName: r.repName,
    teamName: r.teamName,
    source: r.source,
    recurrence: r.recurrence,
    revenueCents: cents(r.revenueCents),
    cashCollectedCents: cash.get(r.id) ?? ZERO,
    status: r.agreementSigned ? "signed" : "open",
  }));
}

/** The commission rollup for the whole book, from real rows. */
export async function getCommissionRollup(
  basis: CommissionBasis = "cash_collected",
): Promise<CommissionRollup> {
  const db = getDb();
  const dealRows = await db.select().from(deals);
  const repRows = await db.select().from(reps);
  const teamRows = await db
    .select({ id: clients.id, defaultCloserBps: clients.defaultCloserBps })
    .from(clients);
  const dealIds = dealRows.map((d) => d.id);
  const splitRows = dealIds.length
    ? await db
        .select()
        .from(commissionSplits)
        .where(inArray(commissionSplits.dealId, dealIds))
    : [];
  const cash = await cashByDeal(dealIds);

  // A deal with no explicit split falls back to its team's default closer rate.
  const teamDefaultCloserBps = new Map<string, Bps>();
  for (const t of teamRows) {
    if (t.defaultCloserBps !== null)
      teamDefaultCloserBps.set(t.id, t.defaultCloserBps as Bps);
  }

  return rollupFromRows(
    dealRows,
    splitRows,
    repRows,
    cash,
    basis,
    teamDefaultCloserBps,
  );
}

/** The focused KPIs the Sales overview leads with. */
export interface SalesOverviewStats {
  cashCollectedCents: Cents;
  revenueCents: Cents;
  dealsClosed: number;
  teamCount: number;
}

export async function getSalesOverview(): Promise<SalesOverviewStats> {
  const db = getDb();
  const dealRows = await db
    .select({ id: deals.id, revenueCents: deals.contractValueCents })
    .from(deals);
  const teams = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.status, "active"));
  const cash = await cashByDeal(dealRows.map((d) => d.id));
  return {
    cashCollectedCents: sum([...cash.values()]),
    revenueCents: sum(dealRows.map((d) => cents(d.revenueCents))),
    dealsClosed: dealRows.length,
    teamCount: teams.length,
  };
}

/** An EOD template shaped for the Templates screen. */
export interface EodTemplateRow {
  id: string;
  clientId: string;
  teamName: string | null;
  role: string;
  cadence: string;
  name: string;
  baseFields: string[];
  customFields: EodCustomField[];
  calcFields: EodCalcField[];
  isActive: boolean;
}

/** Every EOD template, ordered by team then role, for the Templates screen. */
export async function listEodTemplates(): Promise<EodTemplateRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: eodTemplates.id,
      clientId: eodTemplates.clientId,
      teamName: clients.name,
      role: eodTemplates.role,
      cadence: eodTemplates.cadence,
      name: eodTemplates.name,
      baseFields: eodTemplates.baseFields,
      customFields: eodTemplates.customFields,
      calcFields: eodTemplates.calcFields,
      isActive: eodTemplates.isActive,
    })
    .from(eodTemplates)
    .leftJoin(clients, eq(eodTemplates.clientId, clients.id))
    .orderBy(clients.name, eodTemplates.role);
  return rows;
}
