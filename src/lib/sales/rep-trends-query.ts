import "server-only";

import { and, eq, gte } from "drizzle-orm";

import { getDb } from "@/db/client";
import { activityReports, clients, deals, reps } from "@/db/schema/app";
import { moneyEvents } from "@/db/schema/ledger";
import { shiftDay } from "@/lib/activity-heatmap";
import { dayKeyCT } from "@/lib/charts";
import {
  computeRepTrends,
  type DayActivity,
  type DayDeal,
  type RepTrends,
} from "@/lib/sales/rep-trends";

/**
 * Gather the last 60 days of activity + deals and build both trend tables.
 * The bucketing/delta math is the pure, tested code in rep-trends.ts; this only
 * turns real rows into its inputs.
 */
export async function getRepTrends(todayKey: string): Promise<RepTrends> {
  const db = getDb();
  const since = new Date(`${shiftDay(todayKey, -60)}T00:00:00Z`);

  const [repRows, activityRows, dealRows] = await Promise.all([
    db
      .select({ repId: reps.id, name: reps.name, teamName: clients.name })
      .from(reps)
      .leftJoin(clients, eq(reps.clientId, clients.id))
      .where(eq(reps.status, "active")),
    db
      .select({
        repId: activityReports.repId,
        reportDate: activityReports.reportDate,
        metrics: activityReports.metrics,
      })
      .from(activityReports)
      .where(gte(activityReports.reportDate, since)),
    db
      .select({ id: deals.id, repId: deals.repId, closedAt: deals.closedAt })
      .from(deals)
      .where(and(gte(deals.closedAt, since))),
  ]);

  const cashByDeal = new Map<string, number>();
  if (dealRows.length) {
    const events = await db
      .select({ dealId: moneyEvents.dealId, amountCents: moneyEvents.amountCents })
      .from(moneyEvents)
      .where(eq(moneyEvents.eventType, "payment_received"));
    for (const e of events) {
      if (e.dealId) {
        cashByDeal.set(e.dealId, (cashByDeal.get(e.dealId) ?? 0) + e.amountCents);
      }
    }
  }

  const activity: DayActivity[] = activityRows.map((a) => ({
    repId: a.repId,
    day: dayKeyCT(a.reportDate),
    dials: a.metrics?.dials ?? 0,
    shows: a.metrics?.shows ?? 0,
  }));
  const dealsDaily: DayDeal[] = dealRows
    .filter((d): d is typeof d & { repId: string; closedAt: Date } =>
      Boolean(d.repId && d.closedAt),
    )
    .map((d) => ({
      repId: d.repId,
      day: dayKeyCT(d.closedAt),
      cashCents: cashByDeal.get(d.id) ?? 0,
    }));

  return computeRepTrends(
    repRows.map((r) => ({ repId: r.repId, name: r.name, teamName: r.teamName })),
    activity,
    dealsDaily,
    todayKey,
  );
}
