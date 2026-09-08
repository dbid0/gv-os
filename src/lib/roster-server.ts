import "server-only";

import { cache } from "react";
import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { roster as staticRoster, type RosterClient } from "@/lib/roster";

/**
 * THE roster, from the database — signing a client wires them in.
 *
 * lib/roster.ts was a hard-coded file, which answered "would everything wire
 * automatically if I added a client right now?" with NO: a client not in the
 * file 404'd their whole workspace and never appeared in the switcher. The
 * DB rows (clients table, status=active) are the truth now; the static file
 * remains only as a per-field fallback for the original two offers and as
 * the seed's source of record.
 *
 * Fallback order per field: DB column → static file entry (same slug) →
 * honest default. The accent is never blank — a new client gets a stable
 * colour derived from their slug, so their rows and cards are themed from
 * minute one.
 *
 * Wrapped in React cache(): one query per request however many surfaces ask.
 */

/** A stable, readable colour from a slug — same slug, same colour, forever. */
export function accentFromSlug(slug: string): string {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 70% 55%)`;
}

export const loadRoster = cache(async (): Promise<RosterClient[]> => {
  try {
    const db = getDb();
    const rows = await db
      .select({
        slug: clients.slug,
        name: clients.name,
        owner: clients.owner,
        offer: clients.offer,
        category: clients.category,
        accent: clients.accent,
        since: clients.since,
        revShare: clients.revShare,
        summary: clients.summary,
      })
      .from(clients)
      .where(eq(clients.status, "active"))
      .orderBy(asc(clients.createdAt));

    return rows.map((r) => {
      const fallback = staticRoster.find((c) => c.slug === r.slug);
      return {
        slug: r.slug,
        name: r.name,
        owner: r.owner ?? fallback?.owner ?? "",
        offer: r.offer ?? fallback?.offer ?? r.summary ?? "",
        category: r.category ?? fallback?.category ?? "Done-for-you",
        accent: r.accent ?? fallback?.accent ?? accentFromSlug(r.slug),
        since: r.since ?? fallback?.since ?? "",
        revShare: r.revShare ?? fallback?.revShare ?? "",
        summary: r.summary ?? fallback?.summary ?? "",
      };
    });
  } catch {
    // The database failing must not blank the app's navigation — the static
    // two-client roster is stale but real.
    return [...staticRoster];
  }
});

/** One roster client by slug, DB-backed — null instead of a 404 landmine. */
export async function rosterClientBySlug(slug: string): Promise<RosterClient | null> {
  const all = await loadRoster();
  return all.find((c) => c.slug === slug) ?? null;
}
