import { describe, expect, it } from "vitest";

import { failureNote, isFailureNote } from "@/lib/integrations/sync-note";

describe("failureNote", () => {
  it("wraps an Error message with the failure prefix", () => {
    expect(failureNote(new Error("Kit /account failed (401)"))).toBe(
      "sync failed: Kit /account failed (401)",
    );
  });

  it("stringifies non-Error throwables", () => {
    expect(failureNote("boom")).toBe("sync failed: boom");
    expect(failureNote(42)).toBe("sync failed: 42");
  });

  it("collapses whitespace and never returns an empty message", () => {
    expect(failureNote(new Error("a\n  b\t c"))).toBe("sync failed: a b c");
    expect(failureNote(new Error("   "))).toBe("sync failed: unknown error");
  });

  it("truncates long messages to a card-sized note", () => {
    const note = failureNote(new Error("x".repeat(500)));
    expect(note.length).toBe(140);
    expect(note.endsWith("…")).toBe(true);
  });
});

describe("isFailureNote", () => {
  it("recognizes failure notes and nothing else", () => {
    expect(isFailureNote(failureNote(new Error("nope")))).toBe(true);
    expect(isFailureNote("8 sequences, 7 tags")).toBe(false);
    expect(isFailureNote(null)).toBe(false);
    expect(isFailureNote(undefined)).toBe(false);
  });
});
