import { describe, expect, it } from "vitest";

import {
  buildAnalysisPrompt,
  MAX_TRANSCRIPT_CHARS,
  parseCallAnalysis,
  shouldEscalate,
  trimTranscript,
  type CallAnalysis,
} from "@/lib/calls/call-analysis";

const good = JSON.stringify({
  outcome: "Lost on price — prospect wanted proof before paying.",
  objections: ["too expensive", "needs to talk to partner"],
  missedSteps: ["never ran the perspective shift"],
  coaching: ["isolate the objection before re-anchoring"],
  nextStep: "Send the case study, call back Thursday.",
});

describe("parseCallAnalysis", () => {
  it("parses a clean JSON reply", () => {
    const out = parseCallAnalysis(good);
    expect(out?.outcome).toMatch(/Lost on price/);
    expect(out?.objections).toEqual(["too expensive", "needs to talk to partner"]);
    expect(out?.nextStep).toBe("Send the case study, call back Thursday.");
  });

  it("parses JSON wrapped in a code fence", () => {
    expect(parseCallAnalysis("```json\n" + good + "\n```")?.outcome).toMatch(
      /Lost on price/,
    );
  });

  it("parses JSON buried in prose", () => {
    expect(
      parseCallAnalysis(`Here you go:\n${good}\nHope that helps!`)?.outcome,
    ).toMatch(/Lost on price/);
  });

  it("REJECTS a reply with no outcome — the one thing the manager opened it for", () => {
    expect(parseCallAnalysis(JSON.stringify({ objections: ["price"] }))).toBeNull();
    expect(parseCallAnalysis(JSON.stringify({ outcome: "   " }))).toBeNull();
  });

  it("REJECTS junk rather than storing a confident wrong read", () => {
    expect(parseCallAnalysis("")).toBeNull();
    expect(parseCallAnalysis("I could not read that call.")).toBeNull();
    expect(parseCallAnalysis("{ not json")).toBeNull();
  });

  it("drops non-string list entries instead of failing", () => {
    const out = parseCallAnalysis(
      JSON.stringify({
        outcome: "x",
        objections: ["ok", 5, null, "  "],
        coaching: "nope",
      }),
    );
    expect(out?.objections).toEqual(["ok"]);
    expect(out?.coaching).toEqual([]);
  });

  it("normalises a missing nextStep to null", () => {
    expect(
      parseCallAnalysis(JSON.stringify({ outcome: "x", nextStep: "" }))?.nextStep,
    ).toBeNull();
  });
});

describe("trimTranscript", () => {
  it("leaves a short transcript alone", () => {
    expect(trimTranscript("short call")).toBe("short call");
  });

  it("keeps BOTH ends of a long transcript", () => {
    // The open sets the frame; the close carries the objection and the result.
    const text = "OPENING" + "x".repeat(MAX_TRANSCRIPT_CHARS) + "CLOSING";
    const out = trimTranscript(text);
    expect(out.startsWith("OPENING")).toBe(true);
    expect(out.endsWith("CLOSING")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARS);
    expect(out).toContain("middle trimmed");
  });
});

describe("buildAnalysisPrompt", () => {
  it("includes the offer, prospect and logged outcome as context", () => {
    const p = buildAnalysisPrompt("Rep: hello", {
      disposition: "not_interested",
      customerName: "Jane Doe",
      offerName: "The Grid",
    });
    expect(p).toContain("Offer: The Grid");
    expect(p).toContain("Prospect: Jane Doe");
    expect(p).toContain("Logged outcome: not_interested");
    expect(p).toContain("Rep: hello");
  });

  it("omits context lines that are unknown", () => {
    const p = buildAnalysisPrompt("t", {
      disposition: null,
      customerName: null,
      offerName: null,
    });
    expect(p).not.toContain("Offer:");
    expect(p).toContain("Transcript:");
  });
});

describe("shouldEscalate", () => {
  const withFindings: CallAnalysis = {
    outcome: "lost",
    objections: ["price"],
    missedSteps: [],
    coaching: ["isolate first"],
    nextStep: null,
  };
  const bare: CallAnalysis = {
    outcome: "lost",
    objections: [],
    missedSteps: [],
    coaching: [],
    nextStep: null,
  };

  it("escalates a lost or stalled call that has something to coach", () => {
    expect(shouldEscalate("not_interested", withFindings)).toBe(true);
    expect(shouldEscalate("no_show", withFindings)).toBe(true);
    expect(shouldEscalate("follow_up_booked", withFindings)).toBe(true);
  });

  it("does NOT escalate a won deal — nothing to chase", () => {
    expect(shouldEscalate("sale_closed", withFindings)).toBe(false);
  });

  it("does not escalate when there is nothing useful to say", () => {
    expect(shouldEscalate("not_interested", bare)).toBe(false);
  });

  it("does not escalate an unknown disposition", () => {
    expect(shouldEscalate(null, withFindings)).toBe(false);
    expect(shouldEscalate("weird_value", withFindings)).toBe(false);
  });
});
