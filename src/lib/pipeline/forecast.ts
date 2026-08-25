/**
 * GV's own sales pipeline — pure funnel + forecast math, testable to the cent.
 * A prospect carries a proposed setup fee (one-time) and a rev-share (a % of an
 * estimated monthly offer revenue). The forecast never invents money — it sums
 * what has been entered, and weights the open pipeline by each stage's chance.
 */

export const PIPELINE_STAGES = [
  "lead",
  "contacted",
  "call_booked",
  "proposal",
  "won",
  "lost",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Rough close probability per open stage — for the weighted pipeline. */
export const STAGE_PROBABILITY: Record<PipelineStage, number> = {
  lead: 0.1,
  contacted: 0.25,
  call_booked: 0.5,
  proposal: 0.7,
  won: 1,
  lost: 0,
};

/** Stages that are still live (not decided). */
export const OPEN_STAGES: PipelineStage[] = [
  "lead",
  "contacted",
  "call_booked",
  "proposal",
];

export interface ProspectInput {
  stage: string;
  setupFeeCents: number;
  revShareBps: number;
  estMonthlyRevCents: number;
}

/** A prospect's proposed monthly rev-share to GV = est monthly rev × rate. */
export function monthlyRevShareCents(p: ProspectInput): number {
  return Math.round((p.estMonthlyRevCents * p.revShareBps) / 10_000);
}

export interface PipelineForecast {
  byStage: { stage: PipelineStage; count: number }[];
  openCount: number;
  wonCount: number;
  lostCount: number;
  /** Setup fees still in play (open stages). */
  openSetupCents: number;
  /** Monthly rev-share still in play. */
  openMonthlyCents: number;
  /** Open setup + monthly, each weighted by its stage probability. */
  weightedSetupCents: number;
  weightedMonthlyCents: number;
  /** Signed (won) totals. */
  wonSetupCents: number;
  wonMonthlyCents: number;
}

const isOpen = (stage: string): stage is PipelineStage =>
  (OPEN_STAGES as string[]).includes(stage);

export function pipelineForecast(prospects: ProspectInput[]): PipelineForecast {
  const byStage = PIPELINE_STAGES.map((stage) => ({
    stage,
    count: prospects.filter((p) => p.stage === stage).length,
  }));

  let openSetupCents = 0;
  let openMonthlyCents = 0;
  let weightedSetupCents = 0;
  let weightedMonthlyCents = 0;
  let wonSetupCents = 0;
  let wonMonthlyCents = 0;

  for (const p of prospects) {
    const monthly = monthlyRevShareCents(p);
    if (isOpen(p.stage)) {
      openSetupCents += p.setupFeeCents;
      openMonthlyCents += monthly;
      const prob = STAGE_PROBABILITY[p.stage];
      weightedSetupCents += Math.round(p.setupFeeCents * prob);
      weightedMonthlyCents += Math.round(monthly * prob);
    } else if (p.stage === "won") {
      wonSetupCents += p.setupFeeCents;
      wonMonthlyCents += monthly;
    }
  }

  return {
    byStage,
    openCount: prospects.filter((p) => isOpen(p.stage)).length,
    wonCount: prospects.filter((p) => p.stage === "won").length,
    lostCount: prospects.filter((p) => p.stage === "lost").length,
    openSetupCents,
    openMonthlyCents,
    weightedSetupCents,
    weightedMonthlyCents,
    wonSetupCents,
    wonMonthlyCents,
  };
}
