import { ActionBoard } from "@/components/action-list/action-board";
import { listActionItems } from "@/lib/action-list";
import { listTeams } from "@/lib/sales/queries";

export const metadata = { title: "Action list - GV OS" };
export const dynamic = "force-dynamic";

export default async function ActionListPage() {
  const [items, teams] = await Promise.all([listActionItems(), listTeams()]);
  return (
    <ActionBoard items={items} teams={teams.map((t) => ({ id: t.id, name: t.name }))} />
  );
}
