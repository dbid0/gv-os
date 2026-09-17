/**
 * THE BOOK, CUT BY CLIENT.
 *
 * The same finance-sheet rows the agency book sums, grouped by the sheet's own
 * Client cell and run through the same `agencySummary()`. That matters more
 * than it sounds: every per-client figure here is the agency total's own
 * arithmetic on a subset of the identical rows, so the columns add back up.
 * A second source would drift from the front page within a week.
 *
 * Attribution is the sheet's vocabulary mapped onto the roster (`ALIASES` in
 * sheet-aliases): the sheet records a creator's name, the app carries an offer.
 * A row that matches nothing is NOT dropped — it keeps its own line under the
 * name the sheet gave it, because a dropped row is money that quietly stops
 * existing. It just doesn't link anywhere.
 *
 * Attributed offers sort ahead of unattributed names, each by all-time cash.
 * Sorting purely by cash would let a one-off sheet label outrank a live offer
 * at the top of the page.
 *
 * Pure: no database, no clock (the caller passes today).
 */

import {
  agencySummary,
  type AgencySummary,
  type BookDeal,
} from "@/lib/accounting/agency-summary";

/** A book row that still remembers which client the sheet put it under. */
export interface ClientBookDeal extends BookDeal {
  /** The sheet's Client cell, verbatim. */
  client: string;
}

export interface ClientBookEntry {
  /** The roster slug, or null when the sheet's name matches no offer. */
  slug: string | null;
  /** The offer's name when attributed; otherwise the sheet's own wording. */
  name: string;
  /** All-time cash — what the list is ordered by. */
  cashCents: number;
  dealCount: number;
  summary: AgencySummary;
}

/** What a row with an empty Client cell is called, so it still shows up. */
export const UNNAMED_CLIENT = "No client named";

type Group = { slug: string | null; name: string; deals: ClientBookDeal[] };

export function clientBooks(
  deals: ClientBookDeal[],
  todayKey: string,
  roster: { slug: string; name: string }[],
  matches: (slug: string, sheetClient: string) => boolean,
): ClientBookEntry[] {
  const groups = new Map<string, Group>();

  for (const deal of deals) {
    const sheetName = deal.client.trim();
    const hit = roster.find((c) => sheetName !== "" && matches(c.slug, sheetName));
    // Attributed rows key on the slug so two sheet spellings of one creator
    // land on one offer; unattributed rows key on the lower-cased name so
    // casing and stray spacing don't split one label into two lines.
    const key = hit ? `slug:${hit.slug}` : `name:${sheetName.toLowerCase()}`;
    const group = groups.get(key) ?? {
      slug: hit?.slug ?? null,
      name: hit?.name ?? (sheetName || UNNAMED_CLIENT),
      deals: [],
    };
    group.deals.push(deal);
    groups.set(key, group);
  }

  const entries = [...groups.values()].map((g) => ({
    slug: g.slug,
    name: g.name,
    cashCents: g.deals.reduce((s, d) => s + d.cashCents, 0),
    dealCount: g.deals.length,
    summary: agencySummary(g.deals, todayKey),
  }));

  return entries.sort((a, b) => {
    if ((a.slug === null) !== (b.slug === null)) return a.slug === null ? 1 : -1;
    if (b.cashCents !== a.cashCents) return b.cashCents - a.cashCents;
    return a.name.localeCompare(b.name);
  });
}
