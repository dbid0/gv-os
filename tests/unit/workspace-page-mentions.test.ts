import { describe, expect, it } from "vitest";

import { enrichPageMentions, type DescribePage } from "@/lib/workspace/page-mentions";

const BASE = "/clients/workspace";
const ID = "11111111-1111-4111-8111-111111111111";

const describe1: DescribePage = (id) =>
  id === ID ? { title: "Onboarding", icon: "🚀" } : null;

const link = (href: string, text: string) => ({
  type: "link",
  href,
  content: [{ type: "text", text, styles: {} }],
});
const text = (t: string) => ({ type: "text", text: t, styles: {} });

/** The label a mention rendered to. */
function labelOf(block: { content: unknown[] }): string {
  const l = block.content.find((i) => (i as { type?: string }).type === "link") as {
    content: { text: string }[];
  };
  return l.content.map((c) => c.text).join("");
}

describe("enrichPageMentions", () => {
  it("gives a page link the target's CURRENT icon and title", () => {
    const blocks = [
      { type: "paragraph", content: [link(`?page=${ID}`, "Stale old name")] },
    ];
    const out = enrichPageMentions(blocks, BASE, describe1);
    expect(labelOf(out[0])).toBe("🚀 Onboarding");
  });

  it("absorbs a loose emoji sitting before the link, so it is not doubled", () => {
    const blocks = [
      {
        type: "bulletListItem",
        content: [text("📍 "), link(`?page=${ID}`, "Onboarding")],
      },
    ];
    const out = enrichPageMentions(blocks, BASE, describe1);
    expect(out[0].content).toHaveLength(1);
    expect(labelOf(out[0])).toBe("🚀 Onboarding");
  });

  it("keeps a page with no icon as a plain title (no stray space)", () => {
    const noIcon: DescribePage = () => ({ title: "Resources", icon: null });
    const blocks = [{ type: "paragraph", content: [link(`?page=${ID}`, "x")] }];
    expect(labelOf(enrichPageMentions(blocks, BASE, noIcon)[0])).toBe("Resources");
  });

  it("LEAVES an external link untouched", () => {
    const blocks = [
      { type: "paragraph", content: [link("https://example.com", "Example")] },
    ];
    const out = enrichPageMentions(blocks, BASE, describe1);
    expect(labelOf(out[0])).toBe("Example");
  });

  it("LEAVES a link whose target no longer exists untouched", () => {
    const gone = "22222222-2222-4222-8222-222222222222";
    const blocks = [
      { type: "paragraph", content: [link(`?page=${gone}`, "Deleted page")] },
    ];
    expect(labelOf(enrichPageMentions(blocks, BASE, describe1)[0])).toBe(
      "Deleted page",
    );
  });

  it("does not absorb ordinary text before a link", () => {
    const blocks = [
      { type: "paragraph", content: [text("See "), link(`?page=${ID}`, "old")] },
    ];
    const out = enrichPageMentions(blocks, BASE, describe1);
    expect(out[0].content).toHaveLength(2);
    expect((out[0].content[0] as { text: string }).text).toBe("See ");
  });

  it("reaches links nested inside children (the dashboard cards)", () => {
    const blocks = [
      {
        type: "quote",
        content: [text("⚡ Dashboard")],
        children: [
          {
            type: "bulletListItem",
            content: [text("📍 "), link(`?page=${ID}`, "old")],
          },
        ],
      },
    ];
    const out = enrichPageMentions(blocks, BASE, describe1) as never as {
      children: { content: unknown[] }[];
    }[];
    expect(labelOf(out[0].children[0])).toBe("🚀 Onboarding");
  });

  it("never mutates the input", () => {
    const blocks = [{ type: "paragraph", content: [link(`?page=${ID}`, "original")] }];
    const snapshot = JSON.stringify(blocks);
    enrichPageMentions(blocks, BASE, describe1);
    expect(JSON.stringify(blocks)).toBe(snapshot);
  });

  it("is safe on blocks with no content and on an empty document", () => {
    expect(enrichPageMentions([], BASE, describe1)).toEqual([]);
    const odd = [{ type: "todoDatabase", props: {} }];
    expect(enrichPageMentions(odd, BASE, describe1)).toEqual(odd);
  });
});
