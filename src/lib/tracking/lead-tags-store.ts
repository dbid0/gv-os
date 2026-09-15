import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { leadTags, leadViews } from "@/db/schema/app";

/** Every tag on this offer's leads, as stored (aliases unresolved). */
export async function listLeadTags(
  clientId: string,
): Promise<{ leadEmail: string; tag: string }[]> {
  return getDb()
    .select({ leadEmail: leadTags.leadEmail, tag: leadTags.tag })
    .from(leadTags)
    .where(eq(leadTags.clientId, clientId));
}

/** Tag a lead. Adding a tag it already has is a no-op, not an error. */
export async function addLeadTag(
  clientId: string,
  leadEmail: string,
  tag: string,
  by: string | null,
): Promise<void> {
  await getDb()
    .insert(leadTags)
    .values({ clientId, leadEmail: leadEmail.trim().toLowerCase(), tag, createdBy: by })
    .onConflictDoNothing({
      target: [leadTags.clientId, leadTags.leadEmail, leadTags.tag],
    });
}

/**
 * Take a tag off a person — from every inbox given, so a tag added under an
 * alias comes off with the person it was merged into.
 */
export async function removeLeadTag(
  clientId: string,
  emails: string[],
  tag: string,
): Promise<number> {
  if (emails.length === 0) return 0;
  const rows = await getDb()
    .delete(leadTags)
    .where(
      and(
        eq(leadTags.clientId, clientId),
        eq(leadTags.tag, tag),
        sql`${leadTags.leadEmail} in ${emails.map((e) => e.trim().toLowerCase())}`,
      ),
    )
    .returning({ id: leadTags.id });
  return rows.length;
}

export type LeadViewRow = { id: string; name: string; query: string };

export async function listLeadViews(clientId: string): Promise<LeadViewRow[]> {
  return getDb()
    .select({ id: leadViews.id, name: leadViews.name, query: leadViews.query })
    .from(leadViews)
    .where(eq(leadViews.clientId, clientId))
    .orderBy(asc(sql`lower(${leadViews.name})`));
}

/**
 * Save a view. A name already used on this offer (any case) is refused rather
 * than silently overwriting someone else's view — the unique index decides,
 * so two people saving at once can't both win.
 */
export async function saveLeadView(
  clientId: string,
  name: string,
  query: string,
  by: string | null,
): Promise<{ ok: true; id: string } | { ok: false; reason: "name_taken" }> {
  const [row] = await getDb()
    .insert(leadViews)
    .values({ clientId, name, query, createdBy: by })
    .onConflictDoNothing()
    .returning({ id: leadViews.id });
  return row ? { ok: true, id: row.id } : { ok: false, reason: "name_taken" };
}

export async function deleteLeadView(clientId: string, id: string): Promise<boolean> {
  const rows = await getDb()
    .delete(leadViews)
    .where(and(eq(leadViews.clientId, clientId), eq(leadViews.id, id)))
    .returning({ id: leadViews.id });
  return rows.length > 0;
}
