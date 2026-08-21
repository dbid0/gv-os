import "server-only";

import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, integrations } from "@/db/schema/app";

/** A connection shaped for the Integrations page. NEVER carries the secret. */
export interface IntegrationRow {
  id: string;
  provider: string;
  label: string;
  clientId: string | null;
  clientName: string | null;
  secretHint: string | null;
  status: string;
  lastSyncAt: Date | null;
  lastSyncNote: string | null;
}

/** Every connection, with its scope resolved. The sealed secret stays server-side. */
export async function listIntegrations(): Promise<IntegrationRow[]> {
  const db = getDb();
  return db
    .select({
      id: integrations.id,
      provider: integrations.provider,
      label: integrations.label,
      clientId: integrations.clientId,
      clientName: clients.name,
      secretHint: integrations.secretHint,
      status: integrations.status,
      lastSyncAt: integrations.lastSyncAt,
      lastSyncNote: integrations.lastSyncNote,
    })
    .from(integrations)
    .leftJoin(clients, eq(integrations.clientId, clients.id))
    .orderBy(asc(integrations.provider), asc(integrations.label));
}
