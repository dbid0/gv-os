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
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const today = new Date().toISOString().slice(0, 10);

  const [
    [lastRun],
    [openActions],
    [dueToday],
    byMember,
    connections,
    [pay24],
    [payTotal],
    [crm24],
    [crmTotal],
    kitAccounts,
  ] = await Promise.all([
    db
      .select({
        createdAt: sheetSyncRuns.createdAt,
        driftRowCount: sheetSyncRuns.driftRowCount,
        totalAbsDriftCents: sheetSyncRuns.totalAbsDriftCents,
      })
      .from(sheetSyncRuns)
      .orderBy(desc(sheetSyncRuns.createdAt))
      .limit(1),
    db
      .select({ n: count() })
      .from(actionItems)
      .where(ne(actionItems.status, "completed")),
    db
      .select({ n: count() })
      .from(actionItems)
      .where(
        sql`${actionItems.status} <> 'completed' and ${actionItems.dueDate} = ${today}`,
      ),
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
      .select({ n: count() })
      .from(paymentEvents)
      .where(gte(paymentEvents.createdAt, dayAgo)),
    db.select({ n: count() }).from(paymentEvents),
    db
      .select({ n: count() })
      .from(crmActivity)
      .where(gte(crmActivity.createdAt, dayAgo)),
    db.select({ n: count() }).from(crmActivity),
    db
      .selectDistinct({ integrationId: kitSnapshots.integrationId })
      .from(kitSnapshots)
      .innerJoin(integrations, eq(kitSnapshots.integrationId, integrations.id))
      .where(eq(integrations.status, "connected")),
  ]);

  return {
    sheet: lastRun
      ? {
          lastRunAt: lastRun.createdAt,
          driftRowCount: lastRun.driftRowCount,
          totalAbsDriftCents: lastRun.totalAbsDriftCents,
        }
      : null,
    actions: {
      open: openActions?.n ?? 0,
      dueToday: dueToday?.n ?? 0,
      byMember: byMember.map((m) => ({ name: m.name, open: m.open })),
    },
    integrations: connections.map((c) => ({
      ...c,
      stale:
        c.lastSyncAt !== null &&
        Date.now() - c.lastSyncAt.getTime() > STALE_AFTER_HOURS * 60 * 60 * 1000,
    })),
    captures: {
      payments24h: pay24?.n ?? 0,
      paymentsTotal: payTotal?.n ?? 0,
      crm24h: crm24?.n ?? 0,
      crmTotal: crmTotal?.n ?? 0,
      kitAccounts: kitAccounts.length,
    },
  };
}
