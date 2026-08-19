import {
  CommissionsTable,
  type CommissionLine,
} from "@/components/sales/commissions-table";
import { SectionScaffold } from "@/components/sales/section-scaffold";
import { sum } from "@/lib/money";
import { getCommissionRollup, listReps, listTeams } from "@/lib/sales/queries";

export const metadata = {
  title: "Commissions - GV OS",
};

export default async function SalesCommissionsPage() {
  const [rollup, reps, teams] = await Promise.all([
    getCommissionRollup("cash_collected"),
    listReps(),
    listTeams(),
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
    };
  });

  return (
    <CommissionsTable
      lines={lines}
      summary={{
        cashCollectedCents: rollup.teamCashCents,
        revenueCents: rollup.teamRevenueCents,
        commissionCents: sum(rollup.reps.map((r) => r.run.commissionCents)),
        skimCents: sum(rollup.reps.map((r) => r.skimCents)),
        totalOwedCents: rollup.totalOwedCents,
        dealsMissingSplits: rollup.dealsMissingSplits,
      }}
    />
  );
}

// Always read fresh from the database; commission figures must never be cached.
export const dynamic = "force-dynamic";
