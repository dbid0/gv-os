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
      ["🚨 alarm", "yellow"],
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

describe("colorizeCallouts — red bracket placeholders", () => {
  it("splits a bracketed marker into its own red run, keeping the rest plain", () => {
    const [out] = run([paragraph("Send to [CLIENT NAME] today")]);
    const content = out.content!;
    expect(content).toEqual([
      { type: "text", text: "Send to ", styles: {} },
      { type: "text", text: "[CLIENT NAME]", styles: { textColor: "red" } },
      { type: "text", text: " today", styles: {} },
    ]);
  });

  it("wraps multiple markers in a single run", () => {
    const [out] = run([paragraph("[A] and [B]")]);
    const texts = (out.content as Inline[]).map((c) =>
      c.type === "text" ? [c.text, c.styles?.textColor] : null,
    );
    expect(texts).toEqual([
      ["[A]", "red"],
      [" and ", undefined],
      ["[B]", "red"],
    ]);
  });

  it("preserves existing styles (bold/italic) on every split piece", () => {
    const [out] = run([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "bold [X] here", styles: { bold: true, italic: true } },
        ],
      },
    ]);
    for (const piece of out.content as Array<{ styles?: Style }>) {
      expect(piece.styles?.bold).toBe(true);
      expect(piece.styles?.italic).toBe(true);
    }
    const bracket = (out.content as Inline[]).find(
      (c) => c.type === "text" && c.text === "[X]",
    ) as { styles?: Style };
    expect(bracket.styles?.textColor).toBe("red");
  });

  it("wraps markers inside link content too", () => {
    const [out] = run([
      {
        type: "paragraph",
        content: [
          {
            type: "link",
            href: "https://x.test",
            content: [{ type: "text", text: "go to [PORTAL]", styles: {} }],
          },
        ],
      },
    ]);
    const link = (out.content as Inline[])[0];
    expect(link.type).toBe("link");
    if (link.type === "link") {
      expect(link.content).toEqual([
        { type: "text", text: "go to ", styles: {} },
        { type: "text", text: "[PORTAL]", styles: { textColor: "red" } },
      ]);
    }
  });

  it("wraps markers everywhere, including inside nested children", () => {
    const [out] = run([
      {
        type: "toggleListItem",
        content: [{ type: "text", text: "Top [ONE]", styles: {} }],
        children: [paragraph("Child [TWO]")],
      },
    ]);
    const top = (out.content as Inline[]).find(
      (c) => c.type === "text" && c.text === "[ONE]",
    ) as { styles?: Style };
    expect(top.styles?.textColor).toBe("red");
    const child = (out.children![0].content as Inline[]).find(
      (c) => c.type === "text" && c.text === "[TWO]",
    ) as { styles?: Style };
    expect(child.styles?.textColor).toBe("red");
  });

  it("does not touch a run that is already explicitly coloured", () => {
    const [out] = run([
      {
        type: "paragraph",
        content: [{ type: "text", text: "[X]", styles: { textColor: "blue" } }],
      },
    ]);
    expect(out.content).toEqual([
      { type: "text", text: "[X]", styles: { textColor: "blue" } },
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
