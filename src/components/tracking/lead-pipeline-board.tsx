import Link from "next/link";

import { StatusChip } from "@/components/tracking/status-chip";
import { cents, formatUSD } from "@/lib/money";
import { displayName } from "@/lib/text";
import type { LeadSummary } from "@/lib/tracking/leads";
import type { PipelineColumn, PipelineStage } from "@/lib/tracking/pipeline-stage";
import { cn } from "@/lib/utils";

const COLUMN_HINT: Record<PipelineStage, string> = {
  applied: "Applied, nothing booked yet",
  booked: "A call is on the calendar",
  called: "A call happened — EOC filed",
  closed: "Deal logged or cash collected",
  lost: "Sheet marked dq, refunded or dead",
};

const COLUMN_TONE: Record<PipelineStage, string> = {
  applied: "border-t-muted-foreground/40",
  booked: "border-t-brand/60",
  called: "border-t-warning/60",
  closed: "border-t-success/60",
  lost: "border-t-destructive/50",
};

function LeadCard({ slug, lead }: { slug: string; lead: LeadSummary }) {
  const label = lead.name ? displayName(lead.name) : lead.email;
  return (
    <Link
      href={`/w/${slug}/leads/${encodeURIComponent(lead.email)}`}
      className="bg-card hover:border-brand/40 hover:bg-secondary/40 block rounded-lg border p-3 text-left transition-colors"
    >
      <p className="truncate text-sm font-medium">{label}</p>
      {lead.name && <p className="text-faint truncate text-[11px]">{lead.email}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-faint truncate text-[11px]">
          {lead.reps[0] ? displayName(lead.reps[0]) : "No rep on record"}
        </span>
        {lead.paymentsCents > 0 && (
          <span className="text-success shrink-0 text-[11px] font-medium tabular-nums">
            {formatUSD(cents(lead.paymentsCents))}
          </span>
        )}
      </div>
      {lead.latestStatus && (
        <div className="mt-2">
          <StatusChip status={lead.latestStatus} />
        </div>
      )}
      <p className="text-faint mt-2 text-[10px]">
        {lead.lastSeen
          ? `last seen ${lead.lastSeen.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}`
          : "no dated activity"}
      </p>
    </Link>
  );
}

/**
 * The sales-cycle board — one column per derived stage, one card per lead,
 * each card opening the same person page the Leads table and CRM link to.
 *
 * Stages are DERIVED (`pipelineStageOf`), not a field a rep sets by hand, so
 * this can never drift from the Leads page or the person page's own journey —
 * all three read the same `LeadSummary`. Every column shows a per-lead cap so
 * a 400-lead offer does not turn a column into an unscrollable wall; the
 * count in the header still reads the true total.
 */
export function LeadPipelineBoard({
  slug,
  columns,
  maxPerColumn = 30,
}: {
  slug: string;
  columns: PipelineColumn<LeadSummary>[];
  maxPerColumn?: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {columns.map((col) => (
        <div
          key={col.stage}
          className={cn(
            "card-grad flex flex-col overflow-hidden rounded-xl border border-t-2",
            COLUMN_TONE[col.stage],
          )}
        >
          <header className="border-b px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{col.label}</h3>
              <span className="text-faint text-xs tabular-nums">
                {col.leads.length}
              </span>
            </div>
            <p className="text-faint mt-0.5 text-[10.5px]">{COLUMN_HINT[col.stage]}</p>
          </header>
          <div className="flex flex-1 flex-col gap-2 p-2.5">
            {col.leads.length === 0 ? (
              <p className="text-faint px-1 py-6 text-center text-xs">Nobody here</p>
            ) : (
              col.leads
                .slice(0, maxPerColumn)
                .map((lead) => <LeadCard key={lead.email} slug={slug} lead={lead} />)
            )}
            {col.leads.length > maxPerColumn && (
              <p className="text-faint px-1 text-center text-[10.5px]">
                +{col.leads.length - maxPerColumn} more — see the Leads tab
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
