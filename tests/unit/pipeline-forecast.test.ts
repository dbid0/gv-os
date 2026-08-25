import { describe, expect, it } from "vitest";

import {
  monthlyRevShareCents,
  pipelineForecast,
  type ProspectInput,
} from "@/lib/pipeline/forecast";

const p = (o: Partial<ProspectInput>): ProspectInput => ({
  stage: "lead",
  setupFeeCents: 500_000,
  revShareBps: 2000,
  estMonthlyRevCents: 1_000_000,
  ...o,
});

describe("monthlyRevShareCents", () => {
  it("is est monthly revenue × the rate", () => {
    expect(monthlyRevShareCents(p({}))).toBe(200_000); // $10k × 20%
    expect(monthlyRevShareCents(p({ revShareBps: 0 }))).toBe(0);
  });
});

describe("pipelineForecast", () => {
  const prospects = [
    p({ stage: "proposal" }), // open, 70%
    p({ stage: "lead", setupFeeCents: 300_000 }), // open, 10%
    p({ stage: "won", setupFeeCents: 400_000 }), // signed
    p({ stage: "lost" }), // decided
  ];

  it("counts each stage and the open/won/lost totals", () => {
    const f = pipelineForecast(prospects);
    expect(f.openCount).toBe(2);
    expect(f.wonCount).toBe(1);
    expect(f.lostCount).toBe(1);
    expect(f.byStage.find((s) => s.stage === "proposal")?.count).toBe(1);
  });

  it("sums open setup + monthly and the signed totals, ignoring lost", () => {
    const f = pipelineForecast(prospects);
    expect(f.openSetupCents).toBe(500_000 + 300_000); // proposal + lead
    expect(f.openMonthlyCents).toBe(200_000 + 200_000);
    expect(f.wonSetupCents).toBe(400_000);
    expect(f.wonMonthlyCents).toBe(200_000);
  });

  it("weights the open pipeline by each stage's probability", () => {
    const f = pipelineForecast(prospects);
    // proposal $5,000 × 70% + lead $3,000 × 10% = $3,500 + $300.
    expect(f.weightedSetupCents).toBe(350_000 + 30_000);
    // proposal $2,000 × 70% + lead $2,000 × 10% = $1,400 + $200.
    expect(f.weightedMonthlyCents).toBe(140_000 + 20_000);
  });

  it("is all zeros on an empty pipeline", () => {
    const f = pipelineForecast([]);
    expect(f.openCount).toBe(0);
    expect(f.openSetupCents).toBe(0);
    expect(f.weightedMonthlyCents).toBe(0);
  });
});
