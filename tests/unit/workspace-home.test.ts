import { describe, expect, it } from "vitest";

import {
  buildHomeDefaultContent,
  HOME_DASHBOARD_ITEMS,
  resolveHomeLinkHref,
  TODO_DATABASE_BLOCK_TYPE,
  type HomeSeedBlock,
} from "@/lib/workspace/home";
import { buildPageTree, type WorkspacePageLite } from "@/lib/workspace/tree";

function page(
  id: string,
  title: string,
  parentId: string | null = null,
): WorkspacePageLite {
  return {
    id,
    clientId: null,
    parentId,
    title,
    icon: null,
    content: null,
    sortOrder: 0,
  };
}

/** Pull the plain text out of a seed block's inline content. */
function textOf(block: HomeSeedBlock): string {
  return (block.content ?? [])
    .map((c) => {
      const node = c as { text?: string; content?: { text?: string }[] };
      if (typeof node.text === "string") return node.text;
      // A link node carries its label in nested content.
      return (node.content ?? []).map((n) => n.text ?? "").join("");
    })
    .join("");
}

describe("resolveHomeLinkHref", () => {
  it("resolves a title to a relative ?page= href within the tree", () => {
    const tree = buildPageTree([
      page("a", "Onboarding"),
      page("b", "Resources"),
      page("c", "Nested", "a"),
    ]);
    expect(resolveHomeLinkHref(tree, "Onboarding")).toBe("?page=a");
    expect(resolveHomeLinkHref(tree, "Resources")).toBe("?page=b");
  });

  it("matches case-insensitively and searches nested pages", () => {
    const tree = buildPageTree([page("a", "Parent"), page("c", "Custom GPT's", "a")]);
    expect(resolveHomeLinkHref(tree, "custom gpt's")).toBe("?page=c");
  });

  it("returns null when no page carries that title", () => {
    const tree = buildPageTree([page("a", "Onboarding")]);
    expect(resolveHomeLinkHref(tree, "Nonexistent")).toBeNull();
  });
});

describe("buildHomeDefaultContent", () => {
  it("emits a Dashboard heading, one bullet per item, a To-Do heading, and the block", () => {
    const blocks = buildHomeDefaultContent([]);
    // 2 headings + 5 bullets + 1 todoDatabase = 8.
    expect(blocks).toHaveLength(2 + HOME_DASHBOARD_ITEMS.length + 1);

    const headings = blocks.filter((b) => b.type === "heading");
    expect(headings).toHaveLength(2);
    expect(textOf(headings[0])).toBe("Dashboard");
    expect(textOf(headings[1])).toBe("To-Do List");

    const last = blocks[blocks.length - 1];
    expect(last.type).toBe(TODO_DATABASE_BLOCK_TYPE);
  });

  it("renders an unresolved link as plain emoji + title text (no link node)", () => {
    const blocks = buildHomeDefaultContent([]); // empty tree → nothing resolves
    const bullets = blocks.filter((b) => b.type === "bulletListItem");
    expect(bullets).toHaveLength(HOME_DASHBOARD_ITEMS.length);
    // The first item is "Global Ventures Timeline" with its emoji.
    const first = bullets[0];
    expect(textOf(first)).toContain(HOME_DASHBOARD_ITEMS[0].title);
    // No inline node is a link when nothing resolved.
    const hasLink = (first.content ?? []).some(
      (c) => (c as { type?: string }).type === "link",
    );
    expect(hasLink).toBe(false);
  });

  it("renders a resolved link as an actual link node to the page", () => {
    const tree = buildPageTree(
      HOME_DASHBOARD_ITEMS.map((item, i) => page(`p${i}`, item.title)),
    );
    const blocks = buildHomeDefaultContent(tree);
    const bullets = blocks.filter((b) => b.type === "bulletListItem");
    for (let i = 0; i < HOME_DASHBOARD_ITEMS.length; i++) {
      const linkNode = (bullets[i].content ?? []).find(
        (c) => (c as { type?: string }).type === "link",
      ) as { href?: string } | undefined;
      expect(linkNode?.href).toBe(`?page=p${i}`);
    }
  });
});
