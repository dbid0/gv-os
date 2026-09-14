import { Columns3 } from "lucide-react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { LeadPipelineBoard } from "@/components/tracking/lead-pipeline-board";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { WsPageHeader } from "@/components/workspace/ws-page-header";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { viewerIsAdmin } from "@/lib/auth/viewer";
import { rosterClientBySlug } from "@/lib/roster-server";
import { groupByPipelineStage } from "@/lib/tracking/pipeline-stage";
import { currentSnapshot, leadsForClient } from "@/lib/tracking/queries";
import { appEocLeadRows } from "@/lib/calls/eoc-store";

export const dynamic = "force-dynamic";

/**
 * Pipeline — this offer's sales cycle as a board, RepVision-style.
 *
 * GV-internal, the same way Tracking is: a rep-level view of who is where in
 * the funnel is not something to hand a client inside their own portal, so it
 * is gated the identical way Tracking is gated — hidden from the nav AND
 * 404'd on direct navigation, never just hidden chrome.
 *
 * The stage a card sits in is DERIVED from the same `LeadSummary` the Leads
 * page and each person page already read (`pipelineStageOf`), so this board
 * can never show a different "where they are" than either of those pages —
 * there is no separate stage field to drift out of sync.
 */
export default async function WorkspacePipelinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await rosterClientBySlug(slug);
  if (!client) notFound();
  if (!(await viewerIsAdmin())) notFound();

  const db = getDb();
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);

  if (!row) {
    return (
      <Panel
        title="Pipeline"
        aside={<StatusPill tone="pending">Not set up</StatusPill>}
      >
        <p className="text-muted-foreground text-sm">
          {client.name} doesn&apos;t have a client record yet, so there is nothing to
          build a board from. It appears here once the offer is set up and its tracking
          sheet has synced.
        </p>
      </Panel>
    );
  }

  const snapshot = await currentSnapshot(row.id);
  if (!snapshot) {
    return (
      <Panel
        title="Pipeline"
        aside={<StatusPill tone="pending">No sync yet</StatusPill>}
      >
        <p className="text-muted-foreground text-sm">
          The board is built from {client.name}&apos;s Master Tracking Sheet, the same
          source as Leads. Once it&apos;s linked and synced under Tracking, every
          applicant lands in a column here.
        </p>
      </Panel>
    );
  }

  const leads = await leadsForClient(snapshot.syncId, await appEocLeadRows(row.id));
  const columns = groupByPipelineStage(leads);
  const openCount = columns
    .filter((c) => c.stage !== "closed" && c.stage !== "lost")
    .reduce((sum, c) => sum + c.leads.length, 0);
  const closedCount = columns.find((c) => c.stage === "closed")?.leads.length ?? 0;

  return (
    <div className="space-y-6">
      <WsPageHeader
        icon={Columns3}
        title="Pipeline"
        lede="Every lead on this offer, boarded by where they actually are in the sales cycle — derived from the same tracking sheet as Leads, not a separate stage anyone has to keep updated."
        aside={
          <StatusPill tone={openCount > 0 ? "live" : "muted"}>
            {openCount} open · {closedCount} closed
          </StatusPill>
        }
      />
      {leads.length === 0 ? (
        <Panel title="Pipeline">
          <p className="text-faint py-8 text-center text-sm">
            No lead rows on the sheet yet.
          </p>
        </Panel>
      ) : (
        <LeadPipelineBoard slug={slug} columns={columns} />
      )}
      <p className="text-faint text-xs">
        Stage is inferred from the furthest tab a lead has reached — Applications,
        Calls, EOC, Deals, Payments — and from the sheet&apos;s own status wording for
        Lost. Nothing here is edited by hand; fixing a lead&apos;s stage means fixing
        its row on the sheet.
      </p>
    </div>
  );
}
