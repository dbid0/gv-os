import { WorkspaceApp } from "@/components/workspace/workspace-app";
import { listWorkspaceTree } from "@/lib/workspace/queries";

export const metadata = { title: "Workspace - GV OS" };
export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [teamspaces, params] = await Promise.all([listWorkspaceTree(), searchParams]);
  const pageParam = params.page;
  const initialPageId = typeof pageParam === "string" ? pageParam : null;

  return <WorkspaceApp teamspaces={teamspaces} initialPageId={initialPageId} />;
}
