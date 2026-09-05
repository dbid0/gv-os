import { describe, expect, it } from "vitest";

import {
  buildColumnPrompt,
  COLUMN_PROPOSAL_SYSTEM,
  parseColumnProposals,
} from "@/lib/tracking/column-proposal";

describe("buildColumnPrompt", () => {
  it("shows the model real sample values, trimmed", () => {
    const p = buildColumnPrompt("calls", [
      { header: "Booked Calls (net)", values: ["3", "5", ""] },
      { header: "Notes", values: ["x".repeat(80)] },
    ]);
    expect(p).toContain("Sheet tab: calls");
    expect(p).toContain('"Booked Calls (net)"');
    expect(p).toContain('"3"');
    // Long values are cut so one verbose cell cannot crowd out the rest.
    expect(p).not.toContain("x".repeat(60));
  });

  it("says so when a column has no values to show", () => {
    const p = buildColumnPrompt("eoc", [
      { header: "Empty Column", values: ["", "  "] },
    ]);
    expect(p).toContain("(no sample values)");
  });
});

describe("COLUMN_PROPOSAL_SYSTEM", () => {
  it("forbids inventing data, which is the whole safety argument", () => {
    expect(COLUMN_PROPOSAL_SYSTEM).toContain("Never infer or supply data");
    expect(COLUMN_PROPOSAL_SYSTEM).toContain("guessing is worse");
  });
});

describe("parseColumnProposals", () => {
  const asked = ["Booked Calls (net)", "Q5: Budget", "Close Lead ID"];

  it("keeps a confident, valid mapping", () => {
    const reply = `[{"header":"Booked Calls (net)","field":"outcome","reason":"what happened"}]`;
    expect(parseColumnProposals(reply, asked)).toEqual([
      { header: "Booked Calls (net)", field: "outcome", reason: "what happened" },
    ]);
  });

  it("reads a reply wrapped in prose or a code fence", () => {
    const reply =
      'Sure!\n```json\n[{"header":"Q5: Budget","field":"notes","reason":"free text"}]\n```';
    expect(parseColumnProposals(reply, asked)).toHaveLength(1);
  });

  it("DROPS a field this app does not have", () => {
    // The model is a source of suggestions, never a source of schema.
    expect(
      parseColumnProposals(
        `[{"header":"Q5: Budget","field":"budgetBracket","reason":"invented"}]`,
        asked,
      ),
    ).toEqual([]);
    // Including a name from a DIFFERENT vocabulary in this codebase — the
    // activity metrics are not tracking fields, and confusing the two would
    // map a column onto something the parser never reads.
    expect(
      parseColumnProposals(
        `[{"header":"Q5: Budget","field":"apptsSet","reason":"wrong list"}]`,
        asked,
      ),
    ).toEqual([]);
  });

  it("DROPS a header nobody asked about", () => {
    // Stops a model volunteering a mapping for a column it was not shown.
    const reply = `[{"header":"Cash Collected","field":"cash","reason":"money"}]`;
    expect(parseColumnProposals(reply, asked)).toEqual([]);
  });

  it("keeps only the first proposal per column", () => {
    const reply = `[
      {"header":"Close Lead ID","field":"name","reason":"first"},
      {"header":"Close Lead ID","field":"email","reason":"second"}
    ]`;
    const out = parseColumnProposals(reply, asked);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe("first");
  });

  it("returns nothing for an empty, malformed or non-array reply", () => {
    expect(parseColumnProposals("[]", asked)).toEqual([]);
    expect(parseColumnProposals("no json here", asked)).toEqual([]);
    expect(parseColumnProposals('{"header":"x"}', asked)).toEqual([]);
    expect(parseColumnProposals("", asked)).toEqual([]);
  });

  it("matches the header case-insensitively but stores what the model said", () => {
    const reply = `[{"header":"booked calls (NET)","field":"outcome","reason":"r"}]`;
    expect(parseColumnProposals(reply, asked)[0].header).toBe("booked calls (NET)");
  });
});
