import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, utmLinks } from "@/db/schema/app";
import { buildUtmUrl, type BuildUtmFailure, type UtmFields } from "@/lib/marketing/utm";

export type UtmLinkRow = {
  id: string;
  clientId: string;
  clientName: string;
  destinationUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  assembledUrl: string;
  createdBy: string | null;
  createdAt: Date;
};

export type CreateUtmLinkInput = {
  clientId: string;
  destinationUrl: string;
  createdBy: string | null;
} & UtmFields;

export type CreateUtmLinkResult = { ok: true; row: UtmLinkRow } | BuildUtmFailure;

/**
 * Build AND save in one step — this is the only way a `utm_links` row gets
 * written. There is no separate "record it" action: the moment a link is
 * generated it exists in the registry, which is the whole point (a link that
 * only lives in someone's clipboard is a link nobody can look up later).
 */
export async function createUtmLink(
  input: CreateUtmLinkInput,
): Promise<CreateUtmLinkResult> {
  const built = buildUtmUrl(input);
  if (!built.ok) return built;

  const db = getDb();
  const [row] = await db
    .insert(utmLinks)
    .values({
      clientId: input.clientId,
      destinationUrl: input.destinationUrl.trim(),
      utmSource: built.params.source,
      utmMedium: built.params.medium,
      utmCampaign: built.params.campaign,
      utmContent: built.params.content,
      assembledUrl: built.url,
      createdBy: input.createdBy,
    })
    .returning();

  const [client] = await db
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);

  return { ok: true, row: { ...row, clientName: client?.name ?? "Unknown" } };
}

/** Every link ever generated, newest first — the registry. */
export async function listUtmLinks(limit = 300): Promise<UtmLinkRow[]> {
  const db = getDb();
  return db
    .select({
      id: utmLinks.id,
      clientId: utmLinks.clientId,
      clientName: clients.name,
      destinationUrl: utmLinks.destinationUrl,
      utmSource: utmLinks.utmSource,
      utmMedium: utmLinks.utmMedium,
      utmCampaign: utmLinks.utmCampaign,
      utmContent: utmLinks.utmContent,
      assembledUrl: utmLinks.assembledUrl,
      createdBy: utmLinks.createdBy,
      createdAt: utmLinks.createdAt,
    })
    .from(utmLinks)
    .innerJoin(clients, eq(utmLinks.clientId, clients.id))
    .orderBy(desc(utmLinks.createdAt))
    .limit(limit);
}
