import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import type { RosterClient } from "@/lib/roster";

/**
 * THE roster, from the database — signing a client wires them in.
 *
 * lib/roster.ts used to be a hard-coded file, which answered "would
 * everything wire automatically if I added a client right now?" with NO: a
 * client not in the file 404'd their whole workspace and never appeared in
 * the switcher. The DB rows (clients table, status=active) are the only
 * truth now — there is no static file to fall back to.
 *
 * Fallback order per field: DB column → honest default. The accent is never
 * blank — a new client gets a stable colour derived from their slug, so
 * their rows and cards are themed from minute one.
 *
 * Wrapped in React cache(): one query per request however many surfaces ask.
 */

/** A stable, readable colour from a slug — same slug, same colour, forever. */
export function accentFromSlug(slug: string): string {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 70% 55%)`;
}

/**
 * The DB read behind the roster, cached ACROSS requests for 60 seconds.
 * The roster changes when a client is signed or edited — a minute of
 * staleness is invisible there, but the win is huge: the (app) layout needs
 * the roster for the sidebar, and before this every navigation held the
 * ENTIRE first paint hostage to this query. Now the shell streams
 * immediately on all but the first request each minute.
 */
const loadRosterCached = unstable_cache(
  async (): Promise<RosterClient[]> => loadRosterFromDb(),
  ["roster"],
  { revalidate: 60 },
);

async function loadRosterFromDb(): Promise<RosterClient[]> {
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

    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      owner: r.owner ?? "",
      offer: r.offer ?? r.summary ?? "",
      category: r.category ?? "Done-for-you",
      accent: r.accent ?? accentFromSlug(r.slug),
      since: r.since ?? "",
      revShare: r.revShare ?? "",
      summary: r.summary ?? "",
    }));
  } catch {
    // A DB failure must never surface hardcoded client data — clients are
    // manual DB entries only. An empty roster (nav shows no clients) is the
    // honest failure mode; it must never fall back to a static/hardcoded one.
    return [];
  }
}

/** Request-deduped view over the cross-request cache. */
export const loadRoster = cache(async (): Promise<RosterClient[]> =>
  loadRosterCached(),
);

/** One roster client by slug, DB-backed — null instead of a 404 landmine. */
export async function rosterClientBySlug(slug: string): Promise<RosterClient | null> {
  const all = await loadRoster();
  return all.find((c) => c.slug === slug) ?? null;
}
