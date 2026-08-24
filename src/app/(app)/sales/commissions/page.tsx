import {
  CommissionsTable,
  type CommissionLine,
} from "@/components/sales/commissions-table";
import { SectionScaffold } from "@/components/sales/section-scaffold";
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

  const [rollup, reps, teams, paid] = await Promise.all([
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

  return (
    <CommissionsTable
      lines={lines}
      basis={basis}
      summary={{
        cashCollectedCents: rollup.teamCashCents,
        revenueCents: rollup.teamRevenueCents,
        commissionCents: sum(rollup.reps.map((r) => r.run.commissionCents)),
        skimCents: sum(rollup.reps.map((r) => r.skimCents)),
        totalOwedCents: rollup.totalOwedCents,
        dealsMissingSplits: rollup.dealsMissingSplits,
        dealsUncommissioned: rollup.dealsUncommissioned,
      }}
    />
  );
}
