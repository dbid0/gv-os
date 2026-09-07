import { describe, expect, it } from "vitest";

import { displayName, possessive } from "@/lib/text";

describe("possessive", () => {
  it("adds 's to a name that does not end in s", () => {
    expect(possessive("The Vault")).toBe("The Vault’s");
    expect(possessive("The Grid")).toBe("The Grid’s");
  });

  it("adds only an apostrophe to a name ending in s", () => {
    // "Racks Closes's Close account isn't connected" is what shipped.
    expect(possessive("Racks Closes")).toBe("Racks Closes’");
  });

  it("ignores case when checking the ending", () => {
    expect(possessive("ATLAS")).toBe("ATLAS’");
  });

  it("trims and survives an empty name", () => {
    expect(possessive("  The Grid  ")).toBe("The Grid’s");
    expect(possessive("")).toBe("");
    expect(possessive("   ")).toBe("");
  });
});

describe("displayName", () => {
  it("raises an all-lowercase sheet name", () => {
    expect(displayName("lorenzo saponara")).toBe("Lorenzo Saponara");
  });

  it("leaves an already-cased name exactly as typed", () => {
    expect(displayName("Lorenzo Saponara")).toBe("Lorenzo Saponara");
    expect(displayName("McArthur")).toBe("McArthur");
    expect(displayName("JD")).toBe("JD");
  });

  it("handles hyphens and apostrophes inside a lowercase word", () => {
    expect(displayName("o'brien smith-jones")).toBe("O'brien Smith-jones");
  });

  it("preserves the exact spacing between words", () => {
    expect(displayName("ana  maria")).toBe("Ana  Maria");
  });
});
