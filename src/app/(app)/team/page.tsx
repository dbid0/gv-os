import { TeamRoster } from "@/components/team/team-roster";
import { viewerRole } from "@/lib/auth/viewer";
import { listTeams } from "@/lib/sales/queries";
import { listTeamMembers } from "@/lib/team";

export const metadata = { title: "Team - GV OS" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const [members, teams, role] = await Promise.all([
    listTeamMembers(),
    listTeams(),
    viewerRole(),
  ]);
  return (
    <TeamRoster
      members={members}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      // The server actions are the boundary; this only shapes the form so a
      // manager is never offered a choice the server would refuse.
      canManageAllRoles={role === "admin"}
    />
  );
}
