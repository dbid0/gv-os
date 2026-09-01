import { describe, expect, it } from "vitest";
import type { PartialBlock } from "@blocknote/core";

import {
  CALLOUT_ICON_COLORS,
  colorizeCallouts,
} from "@/lib/workspace/colorize-callouts";

// A loose structural view of the blocks we build + assert on, so the tests can
// read colours/styles without wrestling BlockNote's generic block union.
type Style = { textColor?: string; bold?: boolean; italic?: boolean };
type Inline =
  | { type: "text"; text: string; styles?: Style }
  | {
      type: "link";
      href: string;
      content: { type: "text"; text: string; styles?: Style }[];
    };
type Block = {
  type: string;
  props?: { backgroundColor?: string };
  content?: Inline[];
  children?: Block[];
};

/** Build → run colorizeCallouts → read back, all as plain structural objects. */
function run(blocks: Block[]): Block[] {
  return colorizeCallouts(blocks as unknown as PartialBlock[]) as unknown as Block[];
}

function quote(text: string, extra: Partial<Block> = {}): Block {
  return { type: "quote", content: [{ type: "text", text, styles: {} }], ...extra };
}

function paragraph(text: string, extra: Partial<Block> = {}): Block {
  return { type: "paragraph", content: [{ type: "text", text, styles: {} }], ...extra };
}

describe("colorizeCallouts — callout colour by leading icon", () => {
  it("colours a quote by each known leading emoji", () => {
    const cases: Array<[string, string]> = [
      ["⚠️ heads up", "yellow"],
      ["⚡ speed to lead", "yellow"],
      ["⏰ before your first dial", "yellow"],
      ["⏱️ timing", "yellow"],
      ["🚨 compliance line", "red"],
      ["🛡️ compliance", "red"],
      ["🔥 critical", "red"],
      ["💡 tip", "blue"],
      ["ℹ️ note", "blue"],
      ["📣 announce", "blue"],
      ["✅ done", "green"],
      ["🟢 good", "green"],
      ["🎉 win", "green"],
      ["❌ no", "red"],
      ["🔴 stop", "red"],
      ["🚫 banned", "red"],
      ["🔇 muted", "red"],
      ["📌 pinned", "gray"],
      ["💰 money", "gray"],
    ];
    for (const [text, color] of cases) {
      const [out] = run([quote(text)]);
      expect(out.props?.backgroundColor, text).toBe(color);
    }
  });

  it("treats a quote with no / an unknown icon as neutral grey", () => {
    expect(run([quote("plain quote, no emoji")])[0].props?.backgroundColor).toBe(
      "gray",
    );
    expect(run([quote("🦄 unicorn is unmapped")])[0].props?.backgroundColor).toBe(
      "gray",
    );
  });

  it("colours a paragraph ONLY when it opens with a known icon", () => {
    expect(run([paragraph("⚠️ warning para")])[0].props?.backgroundColor).toBe(
      "yellow",
    );
    // A plain paragraph is left untouched — no background colour is added.
    expect(run([paragraph("just a normal paragraph")])[0].props?.backgroundColor).toBe(
      undefined,
    );
    // A paragraph with an unknown leading emoji is NOT a callout.
    expect(run([paragraph("🦄 not a callout")])[0].props?.backgroundColor).toBe(
      undefined,
    );
  });

  it("ignores leading whitespace before the icon", () => {
    expect(run([quote("   💡 spaced")])[0].props?.backgroundColor).toBe("blue");
  });

  it("matches an icon whether or not it carries a variation selector", () => {
    // "⚠" without U+FE0F should still map to yellow.
    expect(run([quote("⚠ bare warning")])[0].props?.backgroundColor).toBe("yellow");
    // "⚠️" with U+FE0F, same row.
    expect(run([quote("⚠️ selector warning")])[0].props?.backgroundColor).toBe(
      "yellow",
    );
  });

  it("does not colour non-callout block types (e.g. headings)", () => {
    const [out] = run([
      { type: "heading", content: [{ type: "text", text: "⚠️ Title" }] },
    ]);
    expect(out.props?.backgroundColor).toBeUndefined();
  });

  it("only colours top-level blocks, not nested children", () => {
    const [out] = run([
      {
        type: "toggleListItem",
        content: [{ type: "text", text: "Toggle" }],
        children: [quote("⚠️ nested")],
      },
    ]);
    expect(out.children?.[0].props?.backgroundColor).toBeUndefined();
  });
});

describe("colorizeCallouts — never overwrite an explicit colour", () => {
  it("leaves a block that already has a non-default background colour", () => {
    const [out] = run([quote("⚠️ warning", { props: { backgroundColor: "purple" } })]);
    expect(out.props?.backgroundColor).toBe("purple");
  });

  it("does colour a block whose background is the default sentinel", () => {
    const [out] = run([quote("⚠️ warning", { props: { backgroundColor: "default" } })]);
    expect(out.props?.backgroundColor).toBe("yellow");
  });
});

describe("colorizeCallouts — bracketed placeholders stay plain", () => {
  it("leaves a [PLACEHOLDER] as ordinary text (Notion renders them plain)", () => {
    const [out] = run([paragraph("Send to [CLIENT NAME] today")]);
    expect(out.content).toEqual([
      { type: "text", text: "Send to [CLIENT NAME] today", styles: {} },
    ]);
  });

  it("leaves text with no brackets unchanged", () => {
    const [out] = run([paragraph("nothing to mark here")]);
    expect(out.content).toEqual([
      { type: "text", text: "nothing to mark here", styles: {} },
    ]);
  });
});

describe("colorizeCallouts — idempotency", () => {
  it("re-running produces a deep-equal result (callouts + brackets + links)", () => {
    const blocks: Block[] = [
      quote("⚠️ warn with [FILL] marker"),
      paragraph("💡 tip [X] and [Y]"),
      paragraph("plain text, [ONLY BRACKET]"),
      {
        type: "toggleListItem",
        content: [{ type: "text", text: "Toggle [Z]", styles: {} }],
        children: [quote("🔥 nested [N]")],
      },
    ];
    const once = run(blocks);
    const twice = run(once);
    expect(twice).toEqual(once);
    // And a third pass, for good measure.
    expect(run(twice)).toEqual(once);
  });

  it("does not mutate its input", () => {
    const input: Block[] = [quote("⚠️ warn [FILL]")];
    const snapshot = JSON.parse(JSON.stringify(input));
    run(input);
    expect(input).toEqual(snapshot);
  });
});

describe("CALLOUT_ICON_COLORS table", () => {
  it("is exported and only uses the five supported colours", () => {
    const allowed = new Set(["yellow", "red", "blue", "green", "gray"]);
    for (const row of CALLOUT_ICON_COLORS) {
      expect(allowed.has(row.color)).toBe(true);
      expect(row.icons.length).toBeGreaterThan(0);
    }
  });
});
