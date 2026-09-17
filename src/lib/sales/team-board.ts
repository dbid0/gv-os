/**
 * THE SALES LANDING — every team, with its numbers on the row.
 *
 * Entering Sales used to land on ten sibling tabs (Teams, Deals, EOD Reports,
 * Commissions, Leaderboard, Call Log, Call Reviews, Quotas, Applications,
 * Templates) before you could see a single team. Daniel's read: teams first,
 * each showing what it did, and the rest are things you open FROM a team.
 *
 * So this is the admin's board across every offer. One row per team:
 * cash collected, the goal it is measured against, deals closed this month,
 * and whether today's EODs are in.
 *
 * Unknown stays unknown. A team whose cash the ledger could not attribute
 * shows a dash, never $0 — "collected nothing" and "nothing could be matched
 * to them" are different sentences and only one of them is about selling.
 * Same for a goal nobody has set.
 *
 * Commissions are deliberately NOT on this row: the rollup is agency-wide and
 * carries no team, so a per-team figure would have to be inferred. An inferred
 * number about what a rep is owed is worse than a link to the page that knows.
 *
 * Pure: no database, no clock.
 */

export interface TeamBoardTeam {
  id: string;
  slug: string;
  name: string;
  monthlyTargetCents: number | null;
}

export interface TeamBoardInput {
  teams: TeamBoardTeam[];
  /** Cash the ledger could attribute to this team, by slug. Absent = unknown. */
  cashBySlug: Record<string, number>;
  /** Closed deals: which team, and the day they closed. */
  deals: { clientId: string; day: string }[];
  /** EOD reports filed, by team name and day. */
  eods: { teamName: string | null; day: string }[];
}

export interface TeamBoardRow {
  id: string;
  slug: string;
  name: string;
  /** Null = the ledger could not attribute cash to this team. */
  cashCents: number | null;
  /** Null = no goal set. A goal is a target, never money. */
  goalCents: number | null;
  /** Deals closed in the month `todayKey` falls in. */
  dealsThisMonth: number;
  /** EOD reports filed today. */
  eodsToday: number;
}

export function salesTeamBoard(
  input: TeamBoardInput,
  todayKey: string,
): TeamBoardRow[] {
  const month = todayKey.slice(0, 7);

  return input.teams.map((team) => {
    const cash = input.cashBySlug[team.slug];
    return {
      id: team.id,
      slug: team.slug,
      name: team.name,
      cashCents: cash === undefined ? null : cash,
      // A goal of 0 is not a goal — it is the absence of one.
      goalCents:
        team.monthlyTargetCents && team.monthlyTargetCents > 0
          ? team.monthlyTargetCents
          : null,
      dealsThisMonth: input.deals.filter(
        (d) => d.clientId === team.id && d.day.startsWith(month),
      ).length,
      // Reports carry the team's NAME, not its id — that is what the report
      // rows store, and matching on anything else silently counts zero.
      eodsToday: input.eods.filter(
        (e) => e.teamName === team.name && e.day === todayKey,
      ).length,
    };
  });
}
