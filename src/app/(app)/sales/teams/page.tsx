import { TeamManager } from "@/components/sales/team-manager";
import { Panel, Row, Rows } from "@/components/ui/panel";
import { StatusDot } from "@/components/ui/status";
import { listReps, listTeams } from "@/lib/sales/queries";

export const metadata = {
  title: "Teams - GV OS",
};

export default async function SalesTeamsPage() {
  const [teams, reps] = await Promise.all([listTeams(), listReps()]);

  const repsByTeam = new Map<string, typeof reps>();
  for (const r of reps) {
    const list = repsByTeam.get(r.clientId) ?? [];
    list.push(r);
    repsByTeam.set(r.clientId, list);
  }

  return (
    <div className="space-y-6">
      <TeamManager teams={teams.map((t) => ({ id: t.id, name: t.name }))} />

      {teams.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {teams.map((team) => {
            const teamReps = repsByTeam.get(team.id) ?? [];
            return (
              <Panel
                key={team.id}
                title={team.name}
                aside={
                  <span className="text-faint text-xs">{teamReps.length} reps</span>
                }
                padded={false}
              >
                <Rows>
                  {teamReps.map((r) => (
                    <Row key={r.id}>
                      <StatusDot tone={r.status === "active" ? "live" : "muted"} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{r.name}</span>
                        <span className="text-muted-foreground block text-xs capitalize">
                          {r.role.replace("_", " ")}
                          {r.commissionBps
                            ? ` · ${(r.commissionBps / 100).toFixed(1)}%`
                            : ""}
                        </span>
                      </span>
                    </Row>
                  ))}
                  {teamReps.length === 0 && (
                    <Row>
                      <span className="text-faint text-xs">No reps yet.</span>
                    </Row>
                  )}
                </Rows>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";
