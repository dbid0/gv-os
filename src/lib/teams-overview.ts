/**
 * The "All teams overview" summary (RepVision's header card): the four
 * headline figures plus a per-team cash breakdown. Pure assembly — the totals
 * are folded from the same client-layer lines that feed the chips, so the top
 * cash always equals the sum of the parts. Testable without a database.
 */

export interface OverviewLine {
  slug: string | null;
  name: string;
  cashCents: number;
  revenueCents: number;
}

export interface TeamChip {
  slug: string;
  name: string;
  cashCents: number;
  revenueCents: number;
}

export interface TeamsOverview {
  cashCents: number;
  revenueCents: number;
  deals: number;
  closeRatePct: number | null;
  /** Attributed teams, largest cash first. */
  teams: TeamChip[];
  /** Cash that matched no roster team — surfaced, never folded away silently. */
  unattributedCents: number;
}

export function buildTeamsOverview(
  lines: OverviewLine[],
  deals: number,
  closeRatePct: number | null,
): TeamsOverview {
  const cashCents = lines.reduce((s, l) => s + l.cashCents, 0);
  const revenueCents = lines.reduce((s, l) => s + l.revenueCents, 0);
  const unattributedCents = lines
    .filter((l) => l.slug === null)
    .reduce((s, l) => s + l.cashCents, 0);

  const teams: TeamChip[] = lines
    .filter((l): l is OverviewLine & { slug: string } => l.slug !== null)
    .map((l) => ({
      slug: l.slug,
      name: l.name,
      cashCents: l.cashCents,
      revenueCents: l.revenueCents,
    }))
    .sort((a, b) => b.cashCents - a.cashCents);

  return { cashCents, revenueCents, deals, closeRatePct, teams, unattributedCents };
}
