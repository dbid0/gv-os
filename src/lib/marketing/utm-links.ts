import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, utmLinks } from "@/db/schema/app";
import { buildUtmUrl, type BuildUtmFailure, type UtmFields } from "@/lib/marketing/utm";
import {
  generateShortCode,
  isShortCode,
  safeRedirectTarget,
} from "@/lib/marketing/short-link";

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
  shortCode: string | null;
  clickCount: number;
  lastClickedAt: Date | null;
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
  const values = {
    clientId: input.clientId,
    destinationUrl: input.destinationUrl.trim(),
    utmSource: built.params.source,
    utmMedium: built.params.medium,
    utmCampaign: built.params.campaign,
    utmContent: built.params.content,
    assembledUrl: built.url,
    createdBy: input.createdBy,
  };
  // A fresh short code; on the (astronomically rare) collision, draw again.
  let row: typeof utmLinks.$inferSelect | undefined;
  for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
    [row] = await db
      .insert(utmLinks)
      .values({ ...values, shortCode: generateShortCode() })
      .onConflictDoNothing({ target: utmLinks.shortCode })
      .returning();
  }
  if (!row) throw new Error("Could not allocate a short link code.");

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
      shortCode: utmLinks.shortCode,
      clickCount: utmLinks.clickCount,
      lastClickedAt: utmLinks.lastClickedAt,
    })
    .from(utmLinks)
    .innerJoin(clients, eq(utmLinks.clientId, clients.id))
    .orderBy(desc(utmLinks.createdAt))
    .limit(limit);
}

/**
 * Resolve a short link and count the click in ONE statement — the increment
 * and the lookup can't disagree, and concurrent clicks never lose a count.
 * Returns the stored redirect target, or null for an unknown or malformed code
 * (or a stored URL that somehow isn't http(s)).
 */
export async function followShortLink(code: string): Promise<string | null> {
  if (!isShortCode(code)) return null;
  const db = getDb();
  const [row] = await db
    .update(utmLinks)
    .set({ clickCount: sql`${utmLinks.clickCount} + 1`, lastClickedAt: new Date() })
    .where(eq(utmLinks.shortCode, code))
    .returning({ assembledUrl: utmLinks.assembledUrl });
  return row ? safeRedirectTarget(row.assembledUrl) : null;
}
