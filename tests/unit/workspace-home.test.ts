import { describe, expect, it } from "vitest";

import {
  buildHomeDefaultContent,
  COLUMN_BLOCK_TYPE,
  COLUMN_LIST_BLOCK_TYPE,
  HOME_CONTENT_ITEMS,
  HOME_DASHBOARD_ITEMS,
  isLegacyHomeSeed,
  MARKETING_ROUTE_HREF,
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

/** Every link node's href inside a block's inline content. */
function linkHrefs(block: HomeSeedBlock): string[] {
  return (block.content ?? [])
    .filter((c) => (c as { type?: string }).type === "link")
    .map((c) => (c as { href?: string }).href ?? "");
}

/** The single columnList's two columns from a seed document. */
function columns(blocks: HomeSeedBlock[]): [HomeSeedBlock, HomeSeedBlock] {
  expect(blocks).toHaveLength(1);
  const [list] = blocks;
  expect(list.type).toBe(COLUMN_LIST_BLOCK_TYPE);
  const cols = list.children ?? [];
  expect(cols).toHaveLength(2);
  expect(cols.every((c) => c.type === COLUMN_BLOCK_TYPE)).toBe(true);
  return [cols[0], cols[1]];
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
  it("emits a single two-column layout", () => {
    const [left, right] = columns(buildHomeDefaultContent([]));
    expect(left.type).toBe(COLUMN_BLOCK_TYPE);
    expect(right.type).toBe(COLUMN_BLOCK_TYPE);
  });

  it("puts a boxed Dashboard section and a boxed Content section in the LEFT column", () => {
    const [left] = columns(buildHomeDefaultContent([]));
    const boxes = left.children ?? [];
    expect(boxes).toHaveLength(2);

    const [dashboard, content] = boxes;
    // Both boxes are grey callout quotes with a bold emoji header.
    expect(dashboard.type).toBe("quote");
    expect(content.type).toBe("quote");
    expect(dashboard.props?.backgroundColor).toBe("gray");
    expect(content.props?.backgroundColor).toBe("gray");
    expect(textOf(dashboard)).toContain("Dashboard");
    expect(textOf(content)).toContain("Content");

    // One bullet per item, in order, nested inside each box.
    expect(dashboard.children).toHaveLength(HOME_DASHBOARD_ITEMS.length);
    expect(content.children).toHaveLength(HOME_CONTENT_ITEMS.length);
  });

  it("puts a To-Do heading over the interactive To-Do database in the RIGHT column", () => {
    const [, right] = columns(buildHomeDefaultContent([]));
    const kids = right.children ?? [];
    expect(kids).toHaveLength(2);
    expect(kids[0].type).toBe("heading");
    expect(textOf(kids[0])).toContain("To-Do List");
    expect(kids[1].type).toBe(TODO_DATABASE_BLOCK_TYPE);
  });

  it("renders an unresolved dashboard link as plain emoji + title text (no link node)", () => {
    const [left] = columns(buildHomeDefaultContent([])); // empty tree → nothing resolves
    const dashboard = (left.children ?? [])[0];
    const bullets = dashboard.children ?? [];
    expect(bullets).toHaveLength(HOME_DASHBOARD_ITEMS.length);
    const first = bullets[0];
    expect(textOf(first)).toContain(HOME_DASHBOARD_ITEMS[0].title);
    expect(linkHrefs(first)).toHaveLength(0);
  });

  it("renders a resolved dashboard link as an actual ?page= link node", () => {
    const tree = buildPageTree(
      HOME_DASHBOARD_ITEMS.map((item, i) => page(`p${i}`, item.title)),
    );
    const [left] = columns(buildHomeDefaultContent(tree));
    const bullets = (left.children ?? [])[0].children ?? [];
    for (let i = 0; i < HOME_DASHBOARD_ITEMS.length; i++) {
      expect(linkHrefs(bullets[i])).toEqual([`?page=p${i}`]);
    }
  });

  it("points every Content link at the in-app marketing route", () => {
    const [left] = columns(buildHomeDefaultContent([]));
    const contentBullets = (left.children ?? [])[1].children ?? [];
    expect(contentBullets).toHaveLength(HOME_CONTENT_ITEMS.length);
    for (const bullet of contentBullets) {
      expect(linkHrefs(bullet)).toEqual([MARKETING_ROUTE_HREF]);
    }
  });
});

describe("isLegacyHomeSeed", () => {
  // A faithful reconstruction of the OLD single-column default seed.
  const legacyTitles = [
    "Global Ventures Timeline",
    "Onboarding",
    "Custom GPT's",
    "Coaching Protocol",
    "Resources",
  ];
  const legacySeed = () =>
    JSON.stringify([
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Dashboard", styles: {} }],
      },
      ...legacyTitles.map((t, i) => ({
        type: "bulletListItem",
        content: [
          { type: "text", text: "🔗 ", styles: {} },
          {
            type: "link",
            href: `?page=x${i}`,
            content: [{ type: "text", text: t, styles: {} }],
          },
        ],
      })),
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "To-Do List", styles: {} }],
      },
      { type: TODO_DATABASE_BLOCK_TYPE },
    ]);

  it("recognises an untouched legacy single-column seed", () => {
    expect(isLegacyHomeSeed(legacySeed())).toBe(true);
  });

  it("recognises the legacy seed even when NONE of its links resolved (plain text)", () => {
    const plain = JSON.stringify([
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Dashboard", styles: {} }],
      },
      ...legacyTitles.map((t) => ({
        type: "bulletListItem",
        content: [{ type: "text", text: `🔗 ${t}`, styles: {} }],
      })),
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "To-Do List", styles: {} }],
      },
      { type: TODO_DATABASE_BLOCK_TYPE },
    ]);
    expect(isLegacyHomeSeed(plain)).toBe(true);
  });

  it("does NOT treat the new two-column layout as legacy", () => {
    expect(isLegacyHomeSeed(JSON.stringify(buildHomeDefaultContent([])))).toBe(false);
  });

  it("does NOT match an edited home (an extra block, reorder, or new wording)", () => {
    const parsed = JSON.parse(legacySeed());
    parsed.push({
      type: "paragraph",
      content: [{ type: "text", text: "my note", styles: {} }],
    });
    expect(isLegacyHomeSeed(JSON.stringify(parsed))).toBe(false);

    const reworded = JSON.parse(legacySeed());
    reworded[0].content[0].text = "My Dashboard";
    expect(isLegacyHomeSeed(JSON.stringify(reworded))).toBe(false);
  });

  it("is null/garbage-safe", () => {
    expect(isLegacyHomeSeed(null)).toBe(false);
    expect(isLegacyHomeSeed("")).toBe(false);
    expect(isLegacyHomeSeed("not json")).toBe(false);
    expect(isLegacyHomeSeed("{}")).toBe(false);
    expect(isLegacyHomeSeed("[]")).toBe(false);
  });
});
