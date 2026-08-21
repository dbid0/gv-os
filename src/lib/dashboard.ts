import "server-only";

import { count, desc, eq, gte, ne, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  actionItems,
  clients,
  crmActivity,
  integrations,
  kitSnapshots,
  paymentEvents,
  sheetSyncRuns,
  teamMembers,
} from "@/db/schema/app";

/**
 * The morning glance — one query pass that answers "what needs attention"
 * from every system wired in so far: the money mirror, the action list, the
 * integration fleet, and the capture tables. Pure reads, no stored rollups.
 */

export interface MorningGlance {
  sheet: {
    lastRunAt: Date | null;
    driftRowCount: number;
    totalAbsDriftCents: number;
  } | null;
  actions: {
    open: number;
    dueToday: number;
    byMember: { name: string; open: number }[];
  };
  integrations: {
    provider: string;
    label: string;
    clientName: string | null;
    lastSyncAt: Date | null;
    lastSyncNote: string | null;
    stale: boolean;
  }[];
  captures: {
    payments24h: number;
    paymentsTotal: number;
    crm24h: number;
    crmTotal: number;
    kitAccounts: number;
  };
}

const STALE_AFTER_HOURS = 26;

export async function getMorningGlance(): Promise<MorningGlance> {
  const db = getDb();
  // Raw-SQL params must be strings with explicit casts: drizzle's db.execute
  // does NOT run driver param mapping, so a JS Date stringifies as
  // "Thu Aug 20 2026 …" — which Postgres rejects and the whole page 500s
  // (shipped broken once; caught by Daniel, not by a timing-only check).
  const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  // THE POOL LAW (learned twice the hard way): concurrent queries in flight
  // must stay comfortably below the pool's `max`, or the excess gets pipelined
  // onto busy connections and Supabase's transaction pooler never answers —
  // the page hangs forever, not slowly. This function once fired 10 parallel
  // queries and, combined with the page's own four, crossed the limit and hung
  // the dashboard for 90s+. All the scalar counts are now ONE round trip of
  // scalar subqueries; total burst here is 4.
  const [[scalars], byMember, connections, kitAccounts] = await Promise.all([
    db.execute<{
      last_run_at: Date | null;
      drift_row_count: number | null;
      total_abs_drift_cents: number | null;
      open_actions: number;
      due_today: number;
      pay_24h: number;
      pay_total: number;
      crm_24h: number;
      crm_total: number;
    }>(sql`
      select
        (select created_at from app.sheet_sync_runs order by created_at desc limit 1) as last_run_at,
        (select drift_row_count from app.sheet_sync_runs order by created_at desc limit 1)::int as drift_row_count,
        (select total_abs_drift_cents from app.sheet_sync_runs order by created_at desc limit 1)::int as total_abs_drift_cents,
        (select count(*) from app.action_items where status <> 'completed')::int as open_actions,
        (select count(*) from app.action_items where status <> 'completed' and due_date = ${today})::int as due_today,
        (select count(*) from app.payment_events where created_at >= ${dayAgoIso}::timestamptz)::int as pay_24h,
        (select count(*) from app.payment_events)::int as pay_total,
        (select count(*) from app.crm_activity where created_at >= ${dayAgoIso}::timestamptz)::int as crm_24h,
        (select count(*) from app.crm_activity)::int as crm_total
    `),
    db
      .select({ name: teamMembers.name, open: count() })
      .from(actionItems)
      .innerJoin(teamMembers, eq(actionItems.assigneeId, teamMembers.id))
      .where(ne(actionItems.status, "completed"))
      .groupBy(teamMembers.name)
      .orderBy(desc(count()))
      .limit(3),
    db
      .select({
        provider: integrations.provider,
        label: integrations.label,
        clientName: clients.name,
        lastSyncAt: integrations.lastSyncAt,
        lastSyncNote: integrations.lastSyncNote,
      })
      .from(integrations)
      .leftJoin(clients, eq(integrations.clientId, clients.id))
      .where(eq(integrations.status, "connected"))
      .orderBy(integrations.provider),
    db
      .selectDistinct({ integrationId: kitSnapshots.integrationId })
      .from(kitSnapshots)
      .innerJoin(integrations, eq(kitSnapshots.integrationId, integrations.id))
      .where(eq(integrations.status, "connected")),
  ]);

  return {
    sheet: scalars?.last_run_at
      ? {
          lastRunAt: new Date(scalars.last_run_at),
          driftRowCount: scalars.drift_row_count ?? 0,
          totalAbsDriftCents: scalars.total_abs_drift_cents ?? 0,
        }
      : null,
    actions: {
      open: scalars?.open_actions ?? 0,
      dueToday: scalars?.due_today ?? 0,
      byMember: byMember.map((m) => ({ name: m.name, open: m.open })),
    },
    integrations: connections.map((c) => ({
      ...c,
      stale:
        c.lastSyncAt !== null &&
        Date.now() - c.lastSyncAt.getTime() > STALE_AFTER_HOURS * 60 * 60 * 1000,
    })),
    captures: {
      payments24h: scalars?.pay_24h ?? 0,
      paymentsTotal: scalars?.pay_total ?? 0,
      crm24h: scalars?.crm_24h ?? 0,
      crmTotal: scalars?.crm_total ?? 0,
      kitAccounts: kitAccounts.length,
    },
  };
}
