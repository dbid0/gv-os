import "server-only";

import { desc, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, integrations, kitBroadcasts, kitSnapshots } from "@/db/schema/app";
import type { SendRecord } from "@/lib/email/recent-sends";

/** The latest snapshot per Kit connection, shaped for the Email section. */
export interface KitOverviewRow {
  /** The client this connection belongs to — the ONLY safe way to match it. */
  clientId: string | null;
  integrationId: string;
  label: string;
  clientName: string | null;
  accountName: string | null;
  plan: string | null;
  sequenceCount: number;
  tagCount: number;
  subscriberCount: number | null;
  sequences: {
    id: number;
    name: string;
    hold?: boolean;
    emailCount?: number;
    subscriberCount?: number;
  }[];
  takenAt: Date;
}

export async function latestKitOverview(): Promise<KitOverviewRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      integrationId: kitSnapshots.integrationId,
      label: integrations.label,
      clientId: kitSnapshots.clientId,
      clientName: clients.name,
      accountName: kitSnapshots.accountName,
      plan: kitSnapshots.plan,
      sequenceCount: kitSnapshots.sequenceCount,
      tagCount: kitSnapshots.tagCount,
      subscriberCount: kitSnapshots.subscriberCount,
      sequences: kitSnapshots.sequences,
      takenAt: kitSnapshots.takenAt,
    })
    .from(kitSnapshots)
    .innerJoin(integrations, eq(kitSnapshots.integrationId, integrations.id))
    .leftJoin(clients, eq(kitSnapshots.clientId, clients.id))
    .where(eq(integrations.status, "connected"))
    .orderBy(desc(kitSnapshots.takenAt));

  // Newest-first scan → keep the first row seen per connection.
  const seen = new Set<string>();
  const latest: KitOverviewRow[] = [];
  for (const row of rows) {
    if (seen.has(row.integrationId)) continue;
    seen.add(row.integrationId);
    latest.push(row);
  }
  return latest.sort((a, b) => (a.clientName ?? "").localeCompare(b.clientName ?? ""));
}

/**
 * List growth per connection: the last subscriber count per CT day, from the
 * daily snapshots. Rows captured before the subscriber_count column exist as
 * null and are excluded — the series starts the day capture began.
 */
export async function kitGrowthByConnection(): Promise<
  Map<string, { at: Date; value: number }[]>
> {
  const db = getDb();
  const rows = await db
    .select({
      integrationId: kitSnapshots.integrationId,
      subscriberCount: kitSnapshots.subscriberCount,
      takenAt: kitSnapshots.takenAt,
    })
    .from(kitSnapshots)
    .where(isNotNull(kitSnapshots.subscriberCount))
    .orderBy(kitSnapshots.takenAt);

  const byConnection = new Map<string, { at: Date; value: number }[]>();
  for (const row of rows) {
    if (row.subscriberCount === null) continue;
    const list = byConnection.get(row.integrationId) ?? [];
    list.push({ at: row.takenAt, value: row.subscriberCount });
    byConnection.set(row.integrationId, list);
  }
  return byConnection;
}

/** The client's sent emails, newest first, stats as Kit reported them. */
export async function broadcastsForClient(clientId: string) {
  const db = getDb();
  return db
    .select({
      externalId: kitBroadcasts.externalId,
      subject: kitBroadcasts.subject,
      sentAt: kitBroadcasts.sentAt,
      status: kitBroadcasts.status,
      recipients: kitBroadcasts.recipients,
      emailsOpened: kitBroadcasts.emailsOpened,
      openRateBps: kitBroadcasts.openRateBps,
      totalClicks: kitBroadcasts.totalClicks,
      clickRateBps: kitBroadcasts.clickRateBps,
      unsubscribes: kitBroadcasts.unsubscribes,
      openTrackingDisabled: kitBroadcasts.openTrackingDisabled,
    })
    .from(kitBroadcasts)
    .where(eq(kitBroadcasts.clientId, clientId))
    .orderBy(desc(kitBroadcasts.sentAt));
}

/**
 * Every account's broadcast stats, keyed by connection — the numbers the Email
 * overview leads with. One read for the whole page rather than one per offer.
 */
export async function broadcastStatsByConnection(): Promise<Map<string, SendRecord[]>> {
  const db = getDb();
  const rows = await db
    .select({
      id: kitBroadcasts.id,
      subject: kitBroadcasts.subject,
      integrationId: kitBroadcasts.integrationId,
      sentAt: kitBroadcasts.sentAt,
      recipients: kitBroadcasts.recipients,
      emailsOpened: kitBroadcasts.emailsOpened,
      totalClicks: kitBroadcasts.totalClicks,
      unsubscribes: kitBroadcasts.unsubscribes,
      openTrackingDisabled: kitBroadcasts.openTrackingDisabled,
    })
    .from(kitBroadcasts);

  const byConnection = new Map<string, SendRecord[]>();
  for (const r of rows) {
    const list = byConnection.get(r.integrationId) ?? [];
    list.push({
      id: r.id,
      subject: r.subject,
      sentAt: r.sentAt,
      recipients: r.recipients,
      emailsOpened: r.emailsOpened,
      totalClicks: r.totalClicks,
      unsubscribes: r.unsubscribes,
      openTrackingDisabled: r.openTrackingDisabled,
    });
    byConnection.set(r.integrationId, list);
  }
  return byConnection;
}
