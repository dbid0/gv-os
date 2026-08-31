import { notFound } from "next/navigation";

import { WorkspaceApp } from "@/components/workspace/workspace-app";
import { getOrCreateHomePage, getTeamspaceTree } from "@/lib/workspace/queries";
import { clientBySlug } from "@/lib/roster";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  return {
    title: client ? `${client.name} workspace - GV OS` : "Workspace - GV OS",
  };
}

/**
 * A client's workspace — their Notion-faithful docs, folded UNDER the client.
 * There is no agency-wide workspace nav any more: each client IS their
 * workspace, so this pane shows only THIS client's teamspace (its pages where
 * clientId = the client), with a link back to the agency templates space.
 */
export default async function ClientWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const teamspace = await getTeamspaceTree(slug);
  if (!teamspace) notFound();
  const home = await getOrCreateHomePage(
    teamspace.clientId,
    teamspace.pages,
    teamspace.name,
  );

  const pageParam = sp.page;
  const initialPageId = typeof pageParam === "string" ? pageParam : null;

  return (
    <WorkspaceApp
      teamspace={teamspace}
      home={home}
      initialPageId={initialPageId}
      homeHref={`/clients/${slug}`}
      agencyHref="/clients/workspace"
    />
  );
}
