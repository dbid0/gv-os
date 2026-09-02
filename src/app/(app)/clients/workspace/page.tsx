import { notFound } from "next/navigation";

import { WorkspaceApp } from "@/components/workspace/workspace-app";
import { listWorkspaceTree } from "@/lib/workspace/queries";

export const metadata = { title: "Agency workspace - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The Global Ventures agency teamspace — the templates / agency space (pages
 * with clientId = null). This is the one workspace not owned by a client, so it
 * lives alongside the roster at /clients/workspace rather than under a slug.
 */
export default async function AgencyWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Every teamspace in one read: the agency's own is edited here, and the rest
  // are listed in the same sidebar so all the offers' docs are visible at once.
  const [sp, all] = await Promise.all([searchParams, listWorkspaceTree()]);
  const teamspace = all.find((ts) => ts.clientId === null);
  if (!teamspace) notFound();
  const otherTeamspaces = all.filter((ts) => ts.clientId !== null);

  const pageParam = sp.page;
  const initialPageId = typeof pageParam === "string" ? pageParam : null;

  return (
    <WorkspaceApp
      teamspace={teamspace}
      initialPageId={initialPageId}
      homeHref="/clients"
      otherTeamspaces={otherTeamspaces}
    />
  );
}
