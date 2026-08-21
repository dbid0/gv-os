import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, integrations, kitSnapshots } from "@/db/schema/app";

/** The latest snapshot per Kit connection, shaped for the Email section. */
export interface KitOverviewRow {
  integrationId: string;
  label: string;
  clientName: string | null;
  accountName: string | null;
  plan: string | null;
  sequenceCount: number;
  tagCount: number;
  sequences: { id: number; name: string; hold?: boolean }[];
  takenAt: Date;
}

export async function latestKitOverview(): Promise<KitOverviewRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      integrationId: kitSnapshots.integrationId,
      label: integrations.label,
      clientName: clients.name,
      accountName: kitSnapshots.accountName,
      plan: kitSnapshots.plan,
      sequenceCount: kitSnapshots.sequenceCount,
      tagCount: kitSnapshots.tagCount,
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
