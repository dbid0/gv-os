import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  type EodCalcField,
  type EodCustomField,
  activityReports,
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

/** One rep's ranked line: EOD activity summed, plus deals and cash from real rows. */
export interface LeaderboardRow {
  repId: string;
  name: string;
  role: string;
  teamName: string | null;
  dials: number;
  connects: number;
  setsBooked: number;
  callsTaken: number;
  shows: number;
  followUps: number;
  dealsClosed: number;
  cashCents: Cents;
}

/**
 * The leaderboard: every active rep, their EOD activity totalled, and their
 * deals and collected cash. Nothing invented — activity comes from submitted
 * reports, cash from the ledger. Ranked by cash, then deals, then shows.
 */
export async function getLeaderboard(role?: string): Promise<LeaderboardRow[]> {
  const db = getDb();
  const repRows = await db
    .select({ id: reps.id, name: reps.name, role: reps.role, teamName: clients.name })
    .from(reps)
    .leftJoin(clients, eq(reps.clientId, clients.id))
    .where(
      role
        ? and(eq(reps.status, "active"), eq(reps.role, role))
        : eq(reps.status, "active"),
    );

  // Sum each rep's activity metrics across all their reports.
  const acts = await db
    .select({ repId: activityReports.repId, metrics: activityReports.metrics })
    .from(activityReports);
  const actByRep = new Map<string, Record<string, number>>();
  for (const a of acts) {
    const cur = actByRep.get(a.repId) ?? {};
    for (const [k, v] of Object.entries(a.metrics ?? {})) {
      cur[k] = (cur[k] ?? 0) + (typeof v === "number" ? v : 0);
    }
    actByRep.set(a.repId, cur);
  }

  // Deals closed and cash collected, per rep, from real rows + the ledger.
  const dealRows = await db.select({ id: deals.id, repId: deals.repId }).from(deals);
  const cash = await cashByDeal(dealRows.map((d) => d.id));
  const dealsByRep = new Map<string, number>();
  const cashByRep = new Map<string, Cents>();
  for (const d of dealRows) {
    if (!d.repId) continue;
    dealsByRep.set(d.repId, (dealsByRep.get(d.repId) ?? 0) + 1);
    const prev = cashByRep.get(d.repId) ?? ZERO;
    cashByRep.set(d.repId, cents(prev + (cash.get(d.id) ?? ZERO)));
  }

  const rows: LeaderboardRow[] = repRows.map((r) => {
    const m = actByRep.get(r.id) ?? {};
    return {
      repId: r.id,
      name: r.name,
      role: r.role,
      teamName: r.teamName,
      dials: m.dials ?? 0,
      connects: m.connects ?? 0,
      setsBooked: m.sets_booked ?? 0,
      callsTaken: m.calls_taken ?? 0,
      shows: m.shows ?? 0,
      followUps: m.follow_up_calls ?? 0,
      dealsClosed: dealsByRep.get(r.id) ?? 0,
      cashCents: cashByRep.get(r.id) ?? ZERO,
    };
  });

  rows.sort(
    (a, b) =>
      b.cashCents - a.cashCents || b.dealsClosed - a.dealsClosed || b.shows - a.shows,
  );
  return rows;
}

/** A submitted activity report shaped for the EOD Reports history. */
export interface EodReportRow {
  id: string;
  reportDate: Date;
  kind: string;
  repName: string | null;
  role: string | null;
  teamName: string | null;
  metrics: Record<string, number>;
  notes: string | null;
}

/** EOD/EOW/BOD submissions, newest first, for the reports history. */
export async function listActivityReports(kind = "eod"): Promise<EodReportRow[]> {
  const db = getDb();
  return db
    .select({
      id: activityReports.id,
      reportDate: activityReports.reportDate,
      kind: activityReports.kind,
      repName: reps.name,
      role: reps.role,
      teamName: clients.name,
      metrics: activityReports.metrics,
      notes: activityReports.notes,
    })
    .from(activityReports)
    .leftJoin(reps, eq(activityReports.repId, reps.id))
    .leftJoin(clients, eq(activityReports.clientId, clients.id))
    .where(eq(activityReports.kind, kind))
    .orderBy(desc(activityReports.reportDate));
}

/** A rep shaped for the Submit-EOD picker. */
export interface EodRepRow {
  id: string;
  name: string;
  role: string;
  clientId: string;
  teamName: string | null;
}

/** Active reps, with their team, for the Submit-EOD form's picker. */
export async function listEodReps(): Promise<EodRepRow[]> {
  const db = getDb();
  return db
    .select({
      id: reps.id,
      name: reps.name,
      role: reps.role,
      clientId: reps.clientId,
      teamName: clients.name,
    })
    .from(reps)
    .leftJoin(clients, eq(reps.clientId, clients.id))
    .where(eq(reps.status, "active"))
    .orderBy(clients.name, reps.name);
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
