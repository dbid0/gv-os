import { notFound } from "next/navigation";

import { DriveAssetsPanel } from "@/components/clients/drive-assets-panel";
import { Panel } from "@/components/ui/panel";
import { getClientDriveAssets } from "@/lib/clients/drive-assets";
import { clientBySlug } from "@/lib/roster";

export const dynamic = "force-dynamic";

/**
 * Workspace Marketing (+Content). The content ENGINE deliberately lives in
 * ODYSSEY (the creative-director software) — this section holds the assets
 * and, as ad accounts connect, the numbers. No fake data.
 */
export default async function WorkspaceMarketingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = clientBySlug(slug);
  if (!client) notFound();
  const drive = await getClientDriveAssets(slug);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Panel title="Content engine">
        <p className="text-faint text-sm">
          {client.name}&apos;s scripts, hooks, and reel batches run through the ODYSSEY
          content OS — ideation, script QC, and boards live there. What lands here:
          published-content performance and ad numbers, as those accounts connect (Phase
          8 integrations).
        </p>
      </Panel>

      <DriveAssetsPanel slug={slug} drive={drive} />
    </div>
  );
}
