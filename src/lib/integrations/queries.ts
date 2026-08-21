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
  /** For payments connections: the catch-hook path to paste into the processor. */
  webhookPath: string | null;
}

/** Every connection, with its scope resolved. The sealed secret stays server-side. */
export async function listIntegrations(): Promise<IntegrationRow[]> {
  const db = getDb();
  const rows = await db
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
      config: integrations.config,
    })
    .from(integrations)
    .leftJoin(clients, eq(integrations.clientId, clients.id))
    .orderBy(asc(integrations.provider), asc(integrations.label));

  return rows.map(({ config, ...row }) => {
    const token = (config as { webhook_token?: string }).webhook_token;
    return {
      ...row,
      webhookPath: token ? `/api/webhooks/payments/${token}` : null,
    };
  });
}
