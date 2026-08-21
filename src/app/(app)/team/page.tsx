import { TeamRoster } from "@/components/team/team-roster";
import { listTeams } from "@/lib/sales/queries";
import { listTeamMembers } from "@/lib/team";

export const metadata = { title: "Team - GV OS" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const [members, teams] = await Promise.all([listTeamMembers(), listTeams()]);
  return (
    <TeamRoster
      members={members}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
    />
  );
}
