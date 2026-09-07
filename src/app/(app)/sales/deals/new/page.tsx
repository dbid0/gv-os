import { DealForm } from "@/components/sales/deal-form";
import { getViewerScope } from "@/lib/home/viewer-scope";
import { scopeRowsToViewer } from "@/lib/home/visibility";
import { listReps, listTeams } from "@/lib/sales/queries";

export const metadata = {
  title: "Log a deal - GV OS",
};

export default async function NewDealPage() {
  const [teamsAll, repsAll, scope] = await Promise.all([
    listTeams(),
    listReps(),
    getViewerScope(),
  ]);
  // A rep logs a deal into THEIR offer — the picker never offers another
  // client's book. With one lane the form locks the team outright.
  const teams = scopeRowsToViewer(teamsAll, (t) => t.id, scope.allowed);
  const teamIds = new Set(teams.map((t) => t.id));
  const reps = repsAll.filter((r) => teamIds.has(r.clientId));

  return (
    <div className="mx-auto max-w-2xl">
      <DealForm
        teams={teams.map((t) => ({
          id: t.id,
          name: t.name,
          defaultCloserBps: t.defaultCloserBps,
        }))}
        reps={reps.map((r) => ({
          id: r.id,
          name: r.name,
          role: r.role,
          clientId: r.clientId,
          commissionBps: r.commissionBps,
        }))}
      />
    </div>
  );
}

export const dynamic = "force-dynamic";
