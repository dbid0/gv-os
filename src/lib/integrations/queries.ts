import "server-only";

import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, integrations } from "@/db/schema/app";
import { providerByValue } from "@/lib/integrations/providers";

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
  /** How this connection was made: api_key | webhook | manual. */
  method: string;
  /** The optional reference link for a manual connection. */
  reference: string | null;
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
    const cfg = config as {
      webhook_token?: string;
      method?: string;
      reference?: string;
    };
    const token = cfg.webhook_token;
    const group = providerByValue(row.provider)?.group;
    const lane = group === "Bookings" ? "bookings" : "payments";
    // Legacy rows have no explicit method: infer from what they carry.
    const method =
      cfg.method ?? (token ? "webhook" : row.secretHint ? "api_key" : "manual");
    return {
      ...row,
      webhookPath: token ? `/api/webhooks/${lane}/${token}` : null,
      method,
      reference: cfg.reference ?? null,
    };
  });
}
