import { leadStatusTone } from "@/lib/tracking/lead-status";
import type { LeadSummary } from "@/lib/tracking/leads";

/**
 * WHERE A LEAD SITS IN THE SALES CYCLE — derived, never stored.
 *
 * The tracking sheet already stitches one lead across Applications, Calls,
 * EOC, Deals, Payments and AR (`buildLeadSummaries`). Rather than adding a
 * new editable "stage" column that could drift from those tabs, the board
 * reads the SAME `LeadSummary` the Leads page and the person page already
 * load and infers a stage from what it already knows happened:
 *
 *   Applied → Booked → Called → Closed, with Lost a terminal branch off
 *   any point once the sheet's own status says so (dq, refund, dead).
 *
 * Priority matters here, because the same lead can carry conflicting
 * signals (a deal logged, then a refund noted in the status column):
 *
 *   1. Net cash actually collected (`paymentsCents`, already refund-netted
 *      by `totalPayments`) is the strongest signal — real money beats any
 *      free-text status.
 *   2. A status matching the sheet's own dead/refund/dq wording
 *      (`leadStatusTone`'s DANGER bucket) overrides an ambiguous deal row —
 *      a closer marking a deal "refunded" should not still read as won.
 *   3. A logged deal with no dead status is still a close.
 *   4. Otherwise, the furthest tab reached (EOC filed, then a call booked)
 *      sets the stage.
 *   5. A lead the offer knows about but hasn't reported past an application
 *      falls to the first stage.
 */
export type PipelineStage = "applied" | "booked" | "called" | "closed" | "lost";

/** Left-to-right column order for the board. */
export const PIPELINE_STAGES: PipelineStage[] = [
  "applied",
  "booked",
  "called",
  "closed",
  "lost",
];

export const PIPELINE_STAGE_LABEL: Record<PipelineStage, string> = {
  applied: "Applied",
  booked: "Booked",
  called: "Called",
  closed: "Closed",
  lost: "Lost",
};

/** The slice of a LeadSummary the derivation actually reads — keeps the
 * function testable against small fixtures instead of a full LeadSummary. */
export type StageInput = Pick<
  LeadSummary,
  "applied" | "callsBooked" | "eocReports" | "deals" | "paymentsCents" | "latestStatus"
>;

export function pipelineStageOf(lead: StageInput): PipelineStage {
  if (lead.paymentsCents > 0) return "closed";
  if (leadStatusTone(lead.latestStatus) === "danger") return "lost";
  if (lead.deals > 0) return "closed";
  if (lead.eocReports > 0) return "called";
  if (lead.callsBooked > 0) return "booked";
  return "applied";
}

/** One board column: the stage and the leads currently sitting in it. */
export interface PipelineColumn<T extends StageInput = LeadSummary> {
  stage: PipelineStage;
  label: string;
  leads: T[];
}

/**
 * Every lead bucketed into its column, in the board's fixed left-to-right
 * order — including empty columns, so a stage with nobody in it still
 * renders (an offer with no losses yet should say "Lost — 0", not omit the
 * column and look like the board is broken).
 */
export function groupByPipelineStage<T extends StageInput>(
  leads: T[],
): PipelineColumn<T>[] {
  const byStage = new Map<PipelineStage, T[]>(PIPELINE_STAGES.map((s) => [s, []]));
  for (const lead of leads) {
    byStage.get(pipelineStageOf(lead))!.push(lead);
  }
  return PIPELINE_STAGES.map((stage) => ({
    stage,
    label: PIPELINE_STAGE_LABEL[stage],
    leads: byStage.get(stage)!,
  }));
}
