import {
  CommissionsTable,
  type CommissionLine,
} from "@/components/sales/commissions-table";
import { SectionScaffold } from "@/components/sales/section-scaffold";
import { getViewerScope } from "@/lib/home/viewer-scope";
import { scopeRowsToViewer } from "@/lib/home/visibility";
import { sum } from "@/lib/money";
import {
  currentPayoutPeriod,
  getCommissionRollup,
  getPaidRepIds,
  listReps,
  listTeams,
} from "@/lib/sales/queries";

export const metadata = {
  title: "Commissions - GV OS",
};

// Always read fresh from the database; commission figures must never be cached.
export const dynamic = "force-dynamic";

export default async function SalesCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ basis?: string }>;
}) {
  const { basis: basisParam } = await searchParams;
  const basis = basisParam === "deal_revenue" ? "deal_revenue" : "cash_collected";
  const period = currentPayoutPeriod();

  const [scope, rollup, reps, teams, paid] = await Promise.all([
    getViewerScope(),
    getCommissionRollup(basis),
    listReps(),
    listTeams(),
    getPaidRepIds(period),
  ]);

  if (rollup.reps.length === 0) {
    return (
      <SectionScaffold
        title="Commissions"
        waitingOn="reps and deals"
        columns={[
          "Rep",
          "Role",
          "Team",
          "Rate",
          "Base",
          "Deals",
          "Commission",
          "Bonus",
          "Total owed",
        ]}
        emptyTitle="No payout run yet"
        emptyDetail="Add a team, its reps, and their deals and each rep's owed line rolls up here — commission on collected cash, plus base and bonus, with the manager's top-line skim."
      />
    );
  }

  const repById = new Map(reps.map((r) => [r.id, r]));
  const teamById = new Map(teams.map((t) => [t.id, t.name]));

  const lines: CommissionLine[] = rollup.reps.map((line) => {
    const rep = repById.get(line.repId);
    return {
      repId: line.repId,
      name: rep?.name ?? "Unknown",
      role: line.role,
      teamName: (rep?.clientId && teamById.get(rep.clientId)) || "—",
      rateBps: rep?.commissionBps ?? null,
      deals: line.run.dealCount,
      baseCents: line.run.baseCents,
      commissionCents: line.run.commissionCents,
      bonusCents: line.run.bonusCents,
      skimCents: line.skimCents,
      totalOwedCents: line.totalOwedCents,
      paid: paid.has(line.repId),
    };
  });

  // A rep may open this page for their own commission, but must not read the
  // whole book. Scope the lines to their offer, then rebuild the summary FROM
  // THOSE LINES — `baseCents` already IS the basis amount for the selected
  // basis, so every figure is a sum of the same tested per-line values rather
  // than a second definition of the number. Showing filtered rows under an
  // agency-wide total would misreport money, which is worse than either.
  const visibleLines = scopeRowsToViewer(
    lines,
    (line) => repById.get(line.repId)?.clientId ?? null,
    scope.allowed,
  );
  const summary = scope.restricted
    ? {
        cashCollectedCents: sum(visibleLines.map((l) => l.baseCents)),
        revenueCents: sum(visibleLines.map((l) => l.baseCents)),
        commissionCents: sum(visibleLines.map((l) => l.commissionCents)),
        skimCents: sum(visibleLines.map((l) => l.skimCents)),
        totalOwedCents: sum(visibleLines.map((l) => l.totalOwedCents)),
        // Agency-wide data-quality counts are not this viewer's to see.
        dealsMissingSplits: 0,
        dealsUncommissioned: 0,
      }
    : {
        cashCollectedCents: rollup.teamCashCents,
        revenueCents: rollup.teamRevenueCents,
        commissionCents: sum(rollup.reps.map((r) => r.run.commissionCents)),
        skimCents: sum(rollup.reps.map((r) => r.skimCents)),
        totalOwedCents: rollup.totalOwedCents,
        dealsMissingSplits: rollup.dealsMissingSplits,
        dealsUncommissioned: rollup.dealsUncommissioned,
      };

  return <CommissionsTable lines={visibleLines} basis={basis} summary={summary} />;
}
