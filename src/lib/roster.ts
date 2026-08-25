/**
 * The agency roster — Global Ventures' active done-for-you clients.
 *
 * Static for now, and deliberately so: this is display data for the dashboard
 * and the Clients section, NOT the DB `clients`/teams table (which holds the
 * sales engine's data). When the Clients module owns a source of truth this
 * reads from the database. Archived clients are absent on purpose — the roster
 * shows only what is live.
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
};

export const roster: RosterClient[] = [
  {
    slug: "the-grid",
    name: "The Grid",
    owner: "Kaden",
    offer: "AI phone farm — ban-resilient IG scaling for agencies",
    category: "Done-for-you",
    accent: "#4aa3ff",
    since: "Jul 2026",
    revShare: "20% of gross",
    summary: "AI phone farm for agencies",
  },
  {
    slug: "the-vault",
    name: "The Vault",
    owner: "Brady",
    offer: "UGC — done-with-you install",
    category: "Done-for-you",
    accent: "#9b6bff",
    since: "Jul 2026",
    revShare: "TBD",
    summary: "Done-with-you UGC offer",
  },
  {
    slug: "racks-closes",
    name: "Racks Closes",
    owner: "Aiden Racks",
    offer: "High-ticket closing / sales training",
    category: "Done-for-you",
    accent: "#2f6bff",
    since: "Jul 2026",
    revShare: "10% after ad spend",
    summary: "High-ticket closing & sales training",
  },
  {
    slug: "the-visionary",
    name: "The Visionary",
    owner: "Tico",
    offer: "Videography & creative — Miami Heat / Baller League videographer",
    category: "Done-for-you",
    accent: "#2C6BFF",
    since: "Aug 2026",
    revShare: "30% after fees",
    summary: "Videography growth for creators",
  },
];

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
