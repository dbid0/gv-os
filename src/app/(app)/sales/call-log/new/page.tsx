import { LogActivityForm } from "@/components/sales/log-activity-form";
import { listReps, listTeams } from "@/lib/sales/queries";

export const metadata = { title: "Log activity - GV OS" };
export const dynamic = "force-dynamic";

export default async function NewCallLogPage() {
  const [teams, reps] = await Promise.all([listTeams(), listReps()]);

  return (
    <div className="mx-auto max-w-2xl">
      <LogActivityForm
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        reps={reps.map((r) => ({
          id: r.id,
          name: r.name,
          role: r.role,
          clientId: r.clientId,
        }))}
      />
    </div>
  );
}
