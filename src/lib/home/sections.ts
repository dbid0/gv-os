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
 * Agency-direct money is the ledger's Unattributed bucket, and ONLY that.
 * Renaming every slug-less line used to paint an off-roster client's card
 * with the agency's label — two "Agency — direct" cards showing different
 * money, one of them somebody else's.
 *
 * Order is positional, never by size: the agency card sits far left, clients
 * follow (largest cash first, as the ledger already sorts them), and anything
 * off-roster trails under its own name so it is visibly NOT a roster client.
 */
export function homeSections(lines: ClientLedgerLine[]): HomeSectionCard[] {
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
      .map((l) => card(l, "Agency — direct")),
    ...active.filter((l) => l.slug).map((l) => card(l, l.name)),
    ...active
      .filter((l) => !l.slug && l.name !== "Unattributed")
      .map((l) => card(l, l.name)),
  ];
}
