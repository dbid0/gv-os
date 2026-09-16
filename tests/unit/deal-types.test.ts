import { describe, expect, it } from "vitest";

import {
  canonicalDealType,
  DEAL_TYPES,
  DEFAULT_DEAL_TYPE,
  isKnownDealType,
} from "@/lib/accounting/deal-types";

describe("canonicalDealType", () => {
  it("folds the spellings the finance sheet actually holds", () => {
    // Every one of these was typed into the real book for the same few kinds
    // of deal, and each used to group as its own category.
    expect(canonicalDealType("Setup")).toBe("Setup");
    expect(canonicalDealType("Setup Fee")).toBe("Setup");

    expect(canonicalDealType("Rev-Share")).toBe("Rev-Share");
    expect(canonicalDealType("Rev-Share Payment")).toBe("Rev-Share");
    // The old form wrote this one without the hyphen, so it matched nothing.
    expect(canonicalDealType("Rev Share")).toBe("Rev-Share");

    expect(canonicalDealType("DFY Build")).toBe("DFY Build");
    expect(canonicalDealType("DFY + Setup Payment")).toBe("DFY Build");

    expect(canonicalDealType("Client Handoff")).toBe("Client Handoff");
    expect(canonicalDealType("Consulting")).toBe("Consulting");
  });

  it("ignores the casing and spacing a human types", () => {
    expect(canonicalDealType("  rev-share  ")).toBe("Rev-Share");
    expect(canonicalDealType("SETUP FEE")).toBe("Setup");
  });

  it("sends the old form's meaningless option to Other", () => {
    // "One-off" existed only as a dropdown option and described nothing.
    expect(canonicalDealType("One-off")).toBe("Other");
  });

  it("never throws on a label nobody has seen before", () => {
    // A deal typed in 2026 must not break a page in 2027.
    expect(canonicalDealType("Barter deal")).toBe("Other");
    expect(canonicalDealType("")).toBe("Other");
    expect(canonicalDealType(null)).toBe("Other");
    expect(canonicalDealType(undefined)).toBe("Other");
  });

  it("always returns something the vocabulary contains", () => {
    for (const raw of ["Setup Fee", "Rev Share", "nonsense", "", "DWY"]) {
      expect(DEAL_TYPES).toContain(canonicalDealType(raw));
    }
  });
});

describe("isKnownDealType", () => {
  it("separates a real match from a silent fallback", () => {
    // Both answer "Other"; only one of them MEANS it.
    expect(canonicalDealType("Other")).toBe("Other");
    expect(canonicalDealType("Barter deal")).toBe("Other");

    expect(isKnownDealType("Other")).toBe(true);
    expect(isKnownDealType("Barter deal")).toBe(false);
    expect(isKnownDealType(null)).toBe(false);
  });
});

describe("the vocabulary itself", () => {
  it("offers a default the list actually contains", () => {
    // The old form defaulted to a value that was not one of its own options,
    // so an untouched form saved a type nothing recognised.
    expect(DEAL_TYPES).toContain(DEFAULT_DEAL_TYPE);
  });

  it("maps every canonical type back to itself", () => {
    for (const t of DEAL_TYPES) {
      expect(canonicalDealType(t)).toBe(t);
      expect(isKnownDealType(t)).toBe(true);
    }
  });
});
