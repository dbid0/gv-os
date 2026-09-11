import { describe, expect, it } from "vitest";

import {
  groupByPipelineStage,
  pipelineStageOf,
  PIPELINE_STAGES,
  type StageInput,
} from "@/lib/tracking/pipeline-stage";

const lead = (over: Partial<StageInput> = {}): StageInput => ({
  applied: true,
  callsBooked: 0,
  eocReports: 0,
  deals: 0,
  paymentsCents: 0,
  latestStatus: null,
  ...over,
});

describe("pipelineStageOf", () => {
  it("a lead with only an application sits at Applied", () => {
    expect(pipelineStageOf(lead())).toBe("applied");
  });

  it("a booked call with no EOC yet sits at Booked", () => {
    expect(pipelineStageOf(lead({ callsBooked: 1 }))).toBe("booked");
  });

  it("a filed end-of-call report sits at Called", () => {
    expect(pipelineStageOf(lead({ callsBooked: 1, eocReports: 1 }))).toBe("called");
  });

  it("a logged deal sits at Closed even before cash nets out", () => {
    expect(pipelineStageOf(lead({ callsBooked: 1, eocReports: 1, deals: 1 }))).toBe(
      "closed",
    );
  });

  it("net cash collected sits at Closed", () => {
    expect(pipelineStageOf(lead({ deals: 1, paymentsCents: 99700 }))).toBe("closed");
  });

  it("cash wins even if the status column also reads dead — real money is the strongest signal", () => {
    expect(
      pipelineStageOf(
        lead({ deals: 1, paymentsCents: 50000, latestStatus: "DQ'd after paying" }),
      ),
    ).toBe("closed");
  });

  it("a dead/refund/dq status overrides an ambiguous deal row with no net cash", () => {
    expect(
      pipelineStageOf(lead({ deals: 1, paymentsCents: 0, latestStatus: "Refunded" })),
    ).toBe("lost");
    expect(pipelineStageOf(lead({ eocReports: 1, latestStatus: "dq" }))).toBe("lost");
    expect(
      pipelineStageOf(lead({ callsBooked: 1, latestStatus: "Not qualified" })),
    ).toBe("lost");
  });

  it("a stalled status (no-show, cancelled) does NOT count as lost — still Called/Booked", () => {
    expect(pipelineStageOf(lead({ callsBooked: 1, latestStatus: "No show" }))).toBe(
      "booked",
    );
  });

  it("a lead with no rows past an application, and no dead status, stays at Applied", () => {
    expect(pipelineStageOf(lead({ applied: true, latestStatus: "Webinar Lead" }))).toBe(
      "applied",
    );
  });
});

describe("groupByPipelineStage", () => {
  it("buckets every lead and keeps the board's fixed column order", () => {
    const columns = groupByPipelineStage([
      lead(), // applied
      lead({ callsBooked: 1 }), // booked
      lead({ callsBooked: 1, eocReports: 1 }), // called
      lead({ deals: 1, paymentsCents: 1000 }), // closed
      lead({ latestStatus: "dead" }), // lost
    ]);

    expect(columns.map((c) => c.stage)).toEqual(PIPELINE_STAGES);
    expect(columns.map((c) => c.leads.length)).toEqual([1, 1, 1, 1, 1]);
  });

  it("includes stages with nobody in them rather than omitting the column", () => {
    const columns = groupByPipelineStage([lead()]);
    const lost = columns.find((c) => c.stage === "lost");
    expect(lost?.leads).toEqual([]);
  });

  it("returns an empty bucket for every stage on an empty lead list", () => {
    const columns = groupByPipelineStage([]);
    expect(columns).toHaveLength(PIPELINE_STAGES.length);
    expect(columns.every((c) => c.leads.length === 0)).toBe(true);
  });
});
