import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";

/**
 * The database id for a roster slug.
 *
 * The roster (lib/roster) is a static list of slugs and display names with no
 * ids, so every surface that needs to attribute rows to a client resolves the
 * id here. Returns null when the slug has no record — callers must then show
 * nothing rather than fall back to matching on the display name, which is what
 * pulled a second "The Grid" record's deals into the real one.
 */
export async function clientIdBySlug(slug: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);
  return row?.id ?? null;
}
