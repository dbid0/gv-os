import { notFound } from "next/navigation";

import { WorkspaceApp } from "@/components/workspace/workspace-app";
import { getTeamspaceTree } from "@/lib/workspace/queries";

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
  const [sp, teamspace] = await Promise.all([searchParams, getTeamspaceTree(null)]);
  if (!teamspace) notFound();

  const pageParam = sp.page;
  const initialPageId = typeof pageParam === "string" ? pageParam : null;

  return (
    <WorkspaceApp
      teamspace={teamspace}
      initialPageId={initialPageId}
      homeHref="/clients"
    />
  );
}
