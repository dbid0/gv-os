/**
 * The `RosterClient` shape shared across the app — no client data lives here.
 *
 * The roster is 100% database-driven: `app.clients` (status="active") is the
 * only source of truth for display data on the dashboard and the Clients
 * section. Signing a client is a DB insert, nothing more — there is no file
 * to edit and no static entry to keep in sync. See `lib/roster-server.ts`
 * for the DB read and the honest per-field defaults it falls back to.
 *
 * `accent` is a client's own data colour. It is used to tag a client's rows and
 * cards, never as app chrome, so it never competes with the brand blue.
 */

export type RosterClient = {
  slug: string;
  name: string;
  owner: string;
  offer: string;
  category: string;
  accent: string;
  since: string;
  revShare: string;
  /** A short 3–8 word summary of what the offer is — the default the Clients
   * card reads. The DB `clients.summary` column overrides this when set (edited
   * inline on the card), so this is only the fallback, never blank. */
  summary: string;
  /** Whether a logo image is on file. Absent = unknown (older callers), and the
   * avatar asks the logo route as before; false = draw the initial, no request. */
  hasLogo?: boolean;
};

export const roster: RosterClient[] = [];

export function clientBySlug(slug: string): RosterClient | undefined {
  return roster.find((c) => c.slug === slug);
}

/** The initial shown in a client's avatar chip: first letter, ignoring "The". */
export function clientInitial(name: string): string {
  return name
    .replace(/^The\s+/i, "")
    .charAt(0)
    .toUpperCase();
}
