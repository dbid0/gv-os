import type { ClientLedgerLine } from "@/lib/transactions/ledger";

/** One card on the dashboard's per-client strip. */
export interface HomeSectionCard {
  slug: string | null;
  name: string;
  cashCents: number;
  revenueCents: number;
}

/**
 * The dashboard's client strip, in FIXED order.
 *
 * Order is positional, never by size: slug-less lines (the bucket named by
 * `unattributedName`) sit far left, clients follow (largest cash first, as
 * the ledger already sorts them), and off-roster lines trail under their own
 * names so they are visibly NOT roster clients.
 *
 * The slug-less bucket's NAME depends on whose money the lines are: on the
 * agency book it is "Agency — direct" (GV income with no client attached);
 * on the client book it stays "Unattributed" — client-layer cash that could
 * not be attributed is NOT agency income, and labelling it that way once put
 * another book's word on a client's money.
 */
export function homeSections(
  lines: ClientLedgerLine[],
  unattributedName = "Unattributed",
): HomeSectionCard[] {
  const active = lines.filter((l) => l.cashCents > 0 || l.revenueCents > 0);
  const card = (l: ClientLedgerLine, name: string): HomeSectionCard => ({
    slug: l.slug,
    name,
    cashCents: l.cashCents,
    revenueCents: l.revenueCents,
  });
  return [
    ...active
      .filter((l) => !l.slug && l.name === "Unattributed")
      .map((l) => card(l, unattributedName)),
    ...active.filter((l) => l.slug).map((l) => card(l, l.name)),
    ...active
      .filter((l) => !l.slug && l.name !== "Unattributed")
      .map((l) => card(l, l.name)),
  ];
}

/**
 * A whole book folded into ONE card — the "All" view's agency card.
 *
 * On All, the strip must not mix layers: a setup fee or rev-share a client
 * paid GV is the AGENCY's income, and rendering it on the client's card
 * reported it as cash their offer collected. So All shows one agency card
 * (everything GV itself collected, attributed or not) beside client cards
 * built from client-layer rows only.
 */
export function totalCard(
  lines: ClientLedgerLine[],
  name: string,
): HomeSectionCard | null {
  const cashCents = lines.reduce((s, l) => s + l.cashCents, 0);
  const revenueCents = lines.reduce((s, l) => s + l.revenueCents, 0);
  if (cashCents <= 0 && revenueCents <= 0) return null;
  return { slug: null, name, cashCents, revenueCents };
}
