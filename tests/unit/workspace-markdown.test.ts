import { describe, expect, it } from "vitest";

import {
  parseBlocks,
  parseInline,
  sanitizeHref,
  type Block,
} from "@/lib/workspace/markdown";

describe("sanitizeHref", () => {
  it("keeps safe schemes and relative links", () => {
    expect(sanitizeHref("https://x.com")).toBe("https://x.com");
    expect(sanitizeHref("http://x.com")).toBe("http://x.com");
    expect(sanitizeHref("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(sanitizeHref("/workspace")).toBe("/workspace");
    expect(sanitizeHref("#section")).toBe("#section");
    expect(sanitizeHref("example.com/path")).toBe("example.com/path");
  });

  it("neutralises script-bearing schemes", () => {
    expect(sanitizeHref("javascript:alert(1)")).toBe("#");
    expect(sanitizeHref("  javascript:alert(1)")).toBe("#");
    expect(sanitizeHref("data:text/html,<script>")).toBe("#");
  });
});

describe("parseInline", () => {
  it("parses bold, italic, strike, and code", () => {
    expect(parseInline("**b**")).toEqual([
      { type: "strong", children: [{ type: "text", value: "b" }] },
    ]);
    expect(parseInline("*i*")).toEqual([
      { type: "em", children: [{ type: "text", value: "i" }] },
    ]);
    expect(parseInline("~~s~~")).toEqual([
      { type: "strike", children: [{ type: "text", value: "s" }] },
    ]);
    expect(parseInline("`c`")).toEqual([{ type: "code", value: "c" }]);
  });

  it("parses a link with a sanitised href", () => {
    expect(parseInline("[go](https://x.com)")).toEqual([
      {
        type: "link",
        href: "https://x.com",
        children: [{ type: "text", value: "go" }],
      },
    ]);
    expect(parseInline("[x](javascript:alert(1))")[0]).toMatchObject({
      type: "link",
      href: "#",
    });
  });

  it("nests emphasis inside bold", () => {
    const nodes = parseInline("**bold _and italic_**");
    expect(nodes[0].type).toBe("strong");
    if (nodes[0].type === "strong") {
      expect(nodes[0].children).toContainEqual({
        type: "em",
        children: [{ type: "text", value: "and italic" }],
      });
    }
  });

  it("treats an unmatched marker as literal text", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ type: "text", value: "2 * 3 = 6" }]);
    expect(parseInline("a `b")).toEqual([{ type: "text", value: "a `b" }]);
  });

  it("keeps code spans literal (no emphasis inside)", () => {
    expect(parseInline("`a*b*c`")).toEqual([{ type: "code", value: "a*b*c" }]);
  });

  it("parses coloured text with a known colour name", () => {
    expect(parseInline("[hot]{red}")).toEqual([
      { type: "color", color: "red", children: [{ type: "text", value: "hot" }] },
    ]);
  });

  it("treats an unknown colour as literal text", () => {
    expect(parseInline("[x]{mauve}")).toEqual([{ type: "text", value: "[x]{mauve}" }]);
  });

  it("still prefers a link over a colour span", () => {
    expect(parseInline("[go](https://x.com)")[0]).toMatchObject({ type: "link" });
  });
});

describe("parseBlocks", () => {
  it("parses headings by level", () => {
    const blocks = parseBlocks("# One\n## Two\n### Three");
    expect(blocks.map((b) => (b.type === "heading" ? b.level : null))).toEqual([
      1, 2, 3,
    ]);
  });

  it("groups consecutive list items and reads their markers", () => {
    const blocks = parseBlocks("- a\n- b\n1. c\n- [ ] d\n- [x] e");
    expect(blocks).toHaveLength(1);
    const list = blocks[0];
    expect(list.type).toBe("list");
    if (list.type === "list") {
      expect(list.items.map((i) => i.marker)).toEqual([
        "bullet",
        "bullet",
        "ordered",
        "check",
        "check",
      ]);
      expect(list.items[2].number).toBe(1);
      expect(list.items[3].checked).toBe(false);
      expect(list.items[4].checked).toBe(true);
    }
  });

  it("reads nesting depth from indentation", () => {
    const blocks = parseBlocks("- top\n  - nested\n    - deeper");
    const list = blocks[0];
    if (list.type === "list") {
      expect(list.items.map((i) => i.depth)).toEqual([0, 1, 2]);
    } else {
      throw new Error("expected a list");
    }
  });

  it("captures a fenced code block verbatim", () => {
    const blocks = parseBlocks("```ts\nconst a = 1;\n```");
    expect(blocks[0]).toEqual({
      type: "code",
      lang: "ts",
      code: "const a = 1;",
    } satisfies Block);
  });

  it("parses a multi-line blockquote", () => {
    const blocks = parseBlocks("> one\n> two");
    expect(blocks[0].type).toBe("quote");
    if (blocks[0].type === "quote") expect(blocks[0].lines).toHaveLength(2);
  });

  it("parses a divider", () => {
    expect(parseBlocks("---")[0]).toEqual({ type: "divider" });
    expect(parseBlocks("***")[0]).toEqual({ type: "divider" });
  });

  it("soft-joins consecutive paragraph lines", () => {
    const blocks = parseBlocks("line one\nline two\n\nsecond para");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "paragraph" });
    if (blocks[0].type === "paragraph") {
      expect(blocks[0].inline).toEqual([{ type: "text", value: "line one line two" }]);
    }
  });

  it("does not confuse a divider with a bullet list", () => {
    const blocks = parseBlocks("- a real bullet");
    expect(blocks[0].type).toBe("list");
  });

  it("reads a tagged quote as a callout with a mapped emoji", () => {
    const blocks = parseBlocks("> [!tip] Do this first");
    expect(blocks[0].type).toBe("callout");
    if (blocks[0].type === "callout") {
      expect(blocks[0].emoji).toBe("💡");
      expect(blocks[0].lines[0]).toEqual([{ type: "text", value: "Do this first" }]);
    }
  });

  it("uses a bare emoji tag as the callout icon", () => {
    const blocks = parseBlocks("> [!⚠️] Careful now");
    expect(blocks[0]).toMatchObject({ type: "callout", emoji: "⚠️" });
  });

  it("leaves an untagged quote as a quote", () => {
    expect(parseBlocks("> just a quote")[0].type).toBe("quote");
  });

  it("parses a toggle and its indented body", () => {
    const blocks = parseBlocks("+ Summary line\n  hidden detail");
    expect(blocks[0].type).toBe("toggle");
    if (blocks[0].type === "toggle") {
      expect(blocks[0].summary).toEqual([{ type: "text", value: "Summary line" }]);
      expect(blocks[0].blocks).toHaveLength(1);
      expect(blocks[0].blocks[0].type).toBe("paragraph");
    }
  });

  it("parses block content nested inside a toggle", () => {
    const blocks = parseBlocks("+ Open me\n  - a\n  - b");
    if (blocks[0].type === "toggle") {
      expect(blocks[0].blocks[0].type).toBe("list");
    } else {
      throw new Error("expected a toggle");
    }
  });
});
