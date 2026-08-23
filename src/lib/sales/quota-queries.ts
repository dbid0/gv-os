import "server-only";

import { desc, eq, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { activityReports, clients, deals, quotas, reps } from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";
import {
  type Pacing,
  computePacing,
  isMoneyMetric,
  monthBounds,
  quotaMetric,
  quotaMetricLabel,
} from "@/lib/sales/quota-pacing";

/**
 * The Quotas read layer.
 *
 * A quota stores only a target; the actual-so-far is DERIVED here from data that
 * already exists — collected cash in the ledger, closed deals, and submitted EOD
 * activity — exactly the sources the leaderboard already trusts. Nothing is
 * invented and nothing is written: this module never touches money, it only
 * measures against it.
 *
 * Actuals are bucketed by (owner, month) in a handful of grouped aggregate
 * queries rather than one query per quota, so the page stays well inside the
 * connection-pool burst budget however many quotas exist.
 */

type PeriodBucket = Map<string, number>;
const keyOf = (id: string, period: string) => `${id}|${period}`;

/** A quota row with its metric resolved, its actual-so-far, and its pacing. */
export interface QuotaRow {
  id: string;
  scope: "rep" | "team";
  repId: string | null;
  repName: string | null;
  repRole: string | null;
  clientId: string;
  teamName: string | null;
  metric: string;
  metricLabel: string;
  isMoney: boolean;
  targetAmount: number;
  period: string;
  notes: string | null;
  actualSoFar: number;
  pacing: Pacing;
  /** The period has fully elapsed — belongs in the Past tab. */
  isPast: boolean;
}

export interface QuotaSummary {
  /** Active (not-yet-past) quotas. The three statuses below sum to this. */
  total: number;
  ahead: number;
  onTrack: number;
  behind: number;
  /** Finished quotas, surfaced in the Past tab. */
  past: number;
}

/** Cash collected (ledger payments) grouped by rep and by team, per month. */
async function cashBuckets(db: ReturnType<typeof getDb>): Promise<{
  byRep: PeriodBucket;
  byTeam: PeriodBucket;
}> {
  const rows = await db
    .select({
      period: sql<string>`to_char(${moneyEvents.occurredAt}, 'YYYY-MM')`,
      repId: deals.repId,
      clientId: moneyEvents.clientId,
      total: sql<number>`coalesce(sum(${moneyEvents.amountCents}), 0)`,
    })
    .from(moneyEvents)
    .leftJoin(deals, eq(moneyEvents.dealId, deals.id))
    .where(eq(moneyEvents.eventType, "payment_received"))
    .groupBy(
      sql`to_char(${moneyEvents.occurredAt}, 'YYYY-MM')`,
      deals.repId,
      moneyEvents.clientId,
    );

  const byRep: PeriodBucket = new Map();
  const byTeam: PeriodBucket = new Map();
  for (const r of rows) {
    const amount = Number(r.total);
    if (r.repId)
      byRep.set(
        keyOf(r.repId, r.period),
        (byRep.get(keyOf(r.repId, r.period)) ?? 0) + amount,
      );
    if (r.clientId)
      byTeam.set(
        keyOf(r.clientId, r.period),
        (byTeam.get(keyOf(r.clientId, r.period)) ?? 0) + amount,
      );
  }
  return { byRep, byTeam };
}

/** Closed-deal counts grouped by rep and by team, per month. */
async function dealBuckets(db: ReturnType<typeof getDb>): Promise<{
  byRep: PeriodBucket;
  byTeam: PeriodBucket;
}> {
  const rows = await db
    .select({
      period: sql<string>`to_char(${deals.closedAt}, 'YYYY-MM')`,
      repId: deals.repId,
      clientId: deals.clientId,
      count: sql<number>`count(*)`,
    })
    .from(deals)
    .where(isNotNull(deals.closedAt))
    .groupBy(sql`to_char(${deals.closedAt}, 'YYYY-MM')`, deals.repId, deals.clientId);

  const byRep: PeriodBucket = new Map();
  const byTeam: PeriodBucket = new Map();
  for (const r of rows) {
    const n = Number(r.count);
    if (r.repId)
      byRep.set(
        keyOf(r.repId, r.period),
        (byRep.get(keyOf(r.repId, r.period)) ?? 0) + n,
      );
    byTeam.set(
      keyOf(r.clientId, r.period),
      (byTeam.get(keyOf(r.clientId, r.period)) ?? 0) + n,
    );
  }
  return { byRep, byTeam };
}

/** EOD activity counts (dials · sets · shows · calls) by rep and team, per month. */
async function activityBuckets(db: ReturnType<typeof getDb>): Promise<{
  byRep: Map<string, Record<string, number>>;
  byTeam: Map<string, Record<string, number>>;
}> {
  const num = (key: string) =>
    sql<number>`coalesce(sum((${activityReports.metrics}->>${key})::numeric), 0)`;
  const rows = await db
    .select({
      period: sql<string>`to_char(${activityReports.reportDate}, 'YYYY-MM')`,
      repId: activityReports.repId,
      clientId: activityReports.clientId,
      dials: num("dials"),
      sets_booked: num("sets_booked"),
      shows: num("shows"),
      calls_taken: num("calls_taken"),
    })
    .from(activityReports)
    .groupBy(
      sql`to_char(${activityReports.reportDate}, 'YYYY-MM')`,
      activityReports.repId,
      activityReports.clientId,
    );

  const byRep = new Map<string, Record<string, number>>();
  const byTeam = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const bundle = {
      dials: Number(r.dials),
      sets_booked: Number(r.sets_booked),
      shows: Number(r.shows),
      calls_taken: Number(r.calls_taken),
    };
    byRep.set(keyOf(r.repId, r.period), bundle);
    const teamKey = keyOf(r.clientId, r.period);
    const prev = byTeam.get(teamKey) ?? {
      dials: 0,
      sets_booked: 0,
      shows: 0,
      calls_taken: 0,
    };
    byTeam.set(teamKey, {
      dials: prev.dials + bundle.dials,
      sets_booked: prev.sets_booked + bundle.sets_booked,
      shows: prev.shows + bundle.shows,
      calls_taken: prev.calls_taken + bundle.calls_taken,
    });
  }
  return { byRep, byTeam };
}

/**
 * Every quota, with its actual-so-far and pacing computed against real data.
 *
 * `nowMs` is passed in by the page (from a single `new Date()`), so the read is
 * a pure function of the clock the caller chose — the server component never
 * reaches for `Date.now()` itself.
 */
export async function listQuotasWithPacing(nowMs: number): Promise<QuotaRow[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: quotas.id,
      scope: quotas.scope,
      repId: quotas.repId,
      clientId: quotas.clientId,
      metric: quotas.metric,
      targetAmount: quotas.targetAmount,
      period: quotas.period,
      notes: quotas.notes,
      repName: reps.name,
      repRole: reps.role,
      teamName: clients.name,
      createdAt: quotas.createdAt,
    })
    .from(quotas)
    .leftJoin(reps, eq(quotas.repId, reps.id))
    .leftJoin(clients, eq(quotas.clientId, clients.id))
    .orderBy(desc(quotas.period), desc(quotas.createdAt));

  if (rows.length === 0) return [];

  // Only run the aggregate a metric actually needs.
  const sources = new Set(rows.map((r) => quotaMetric(r.metric)?.source));
  const [cash, dealCounts, activity] = await Promise.all([
    sources.has("ledger") ? cashBuckets(db) : Promise.resolve(null),
    sources.has("deals") ? dealBuckets(db) : Promise.resolve(null),
    sources.has("activity") ? activityBuckets(db) : Promise.resolve(null),
  ]);

  const actualFor = (row: (typeof rows)[number]): number => {
    const def = quotaMetric(row.metric);
    if (!def) return 0;
    const isRep = row.scope === "rep" && row.repId;
    const ownerKey = isRep
      ? keyOf(row.repId!, row.period)
      : keyOf(row.clientId, row.period);

    if (def.source === "ledger") {
      const b = isRep ? cash?.byRep : cash?.byTeam;
      return b?.get(ownerKey) ?? 0;
    }
    if (def.source === "deals") {
      const b = isRep ? dealCounts?.byRep : dealCounts?.byTeam;
      return b?.get(ownerKey) ?? 0;
    }
    const bundle = (isRep ? activity?.byRep : activity?.byTeam)?.get(ownerKey);
    return bundle?.[def.activityKey ?? row.metric] ?? 0;
  };

  return rows.map((row) => {
    const { startMs, endMs } = monthBounds(row.period);
    const targetAmount = Number(row.targetAmount);
    const actualSoFar = actualFor(row);
    const pacing = computePacing({ targetAmount, actualSoFar, startMs, endMs, nowMs });
    return {
      id: row.id,
      scope: row.scope === "team" ? "team" : "rep",
      repId: row.repId,
      repName: row.repName,
      repRole: row.repRole,
      clientId: row.clientId,
      teamName: row.teamName,
      metric: row.metric,
      metricLabel: quotaMetricLabel(row.metric),
      isMoney: isMoneyMetric(row.metric),
      targetAmount,
      period: row.period,
      notes: row.notes,
      actualSoFar,
      pacing,
      isPast: endMs <= nowMs,
    } satisfies QuotaRow;
  });
}

/** The four summary-card counts, computed over the active (not-past) quotas. */
export function summarizeQuotas(rows: QuotaRow[]): QuotaSummary {
  const active = rows.filter((r) => !r.isPast);
  return {
    total: active.length,
    ahead: active.filter((r) => r.pacing.status === "ahead").length,
    onTrack: active.filter((r) => r.pacing.status === "on_track").length,
    behind: active.filter((r) => r.pacing.status === "behind").length,
    past: rows.length - active.length,
  };
}
