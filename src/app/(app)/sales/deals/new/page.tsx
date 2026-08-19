import { DealForm } from "@/components/sales/deal-form";
import { listReps, listTeams } from "@/lib/sales/queries";

export const metadata = {
  title: "Log a deal - GV OS",
};

export default async function NewDealPage() {
  const [teams, reps] = await Promise.all([listTeams(), listReps()]);

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
