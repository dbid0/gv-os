import { ActionBoard } from "@/components/action-list/action-board";
import { listActionItems } from "@/lib/action-list";
import { listTeams } from "@/lib/sales/queries";
import { listActiveMembers } from "@/lib/team";

export const metadata = { title: "Action list - GV OS" };
export const dynamic = "force-dynamic";

export default async function ActionListPage() {
  const [items, teams, members] = await Promise.all([
    listActionItems(),
    listTeams(),
    listActiveMembers(),
  ]);
  return (
    <ActionBoard
      items={items}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      members={members.map((m) => ({ id: m.id, name: m.name }))}
    />
  );
}
