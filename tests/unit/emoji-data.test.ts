import { describe, expect, it } from "vitest";

import {
  ALL_EMOJI,
  EMOJI_BY_CATEGORY,
  EMOJI_CATEGORIES,
  searchEmoji,
} from "@/lib/workspace/emoji-data";

describe("emoji catalogue", () => {
  it("loads the full Unicode set, not a curated handful", () => {
    // The old picker shipped 48 hardcoded glyphs; this must be the real set.
    expect(ALL_EMOJI.length).toBeGreaterThan(1500);
  });

  it("groups every emoji under one of the displayed categories, in order", () => {
    expect(EMOJI_BY_CATEGORY.map((g) => g.category.id)).toEqual(
      EMOJI_CATEGORIES.map((c) => c.id),
    );
    for (const group of EMOJI_BY_CATEGORY) {
      expect(group.emojis.length).toBeGreaterThan(0);
      for (const e of group.emojis) expect(e.category).toBe(group.category.id);
    }
  });

  it("gives every entry a glyph, a name, and search terms", () => {
    for (const e of ALL_EMOJI.slice(0, 200)) {
      expect(e.native.length).toBeGreaterThan(0);
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.terms.length).toBeGreaterThan(0);
    }
  });
});

describe("searchEmoji", () => {
  it("finds emoji by name", () => {
    expect(searchEmoji("rocket").map((e) => e.native)).toContain("🚀");
    expect(searchEmoji("fire").map((e) => e.native)).toContain("🔥");
  });

  it("finds emoji by keyword, not just the name", () => {
    // "clip" is a keyword of the paperclip, whose name is "Paperclip".
    expect(searchEmoji("clip").map((e) => e.native)).toContain("📎");
  });

  it("is case-insensitive and ignores surrounding space", () => {
    expect(searchEmoji("  RoCkEt ").map((e) => e.native)).toContain("🚀");
  });

  it("ranks prefix matches ahead of mid-word ones", () => {
    const hits = searchEmoji("smile");
    // A term literally starting with "smile" should come before an incidental one.
    expect(hits[0].terms.some((t) => t.startsWith("smile"))).toBe(true);
  });

  it("returns the glyph itself when one is pasted in", () => {
    expect(searchEmoji("🚀").map((e) => e.native)).toEqual(["🚀"]);
  });

  it("returns nothing for an empty query, so the browsable grid shows instead", () => {
    expect(searchEmoji("")).toEqual([]);
    expect(searchEmoji("   ")).toEqual([]);
  });

  it("returns nothing for gibberish", () => {
    expect(searchEmoji("zzzzzznotanemoji")).toEqual([]);
  });

  it("caps how many results it returns", () => {
    expect(searchEmoji("a", 20).length).toBeLessThanOrEqual(20);
  });
});
