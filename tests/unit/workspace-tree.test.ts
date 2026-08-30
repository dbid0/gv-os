import { describe, expect, it } from "vitest";

import {
  buildPageTree,
  collectSubtreeIds,
  findNodeByTitle,
  flattenTree,
  pageBreadcrumb,
  planMove,
  topLevelNodes,
  type WorkspacePageLite,
} from "@/lib/workspace/tree";

function page(
  id: string,
  parentId: string | null,
  sortOrder = 0,
  extra: Partial<WorkspacePageLite> = {},
): WorkspacePageLite {
  return {
    id,
    clientId: null,
    parentId,
    title: extra.title ?? id,
    icon: extra.icon ?? null,
    content: extra.content ?? null,
    sortOrder,
    ...extra,
  };
}

describe("buildPageTree", () => {
  it("nests children under their parents", () => {
    const tree = buildPageTree([
      page("root", null),
      page("child", "root"),
      page("grandchild", "child"),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("root");
    expect(tree[0].children[0].id).toBe("child");
    expect(tree[0].children[0].children[0].id).toBe("grandchild");
  });

  it("stamps depth as it descends", () => {
    const tree = buildPageTree([page("a", null), page("b", "a"), page("c", "b")]);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it("orders siblings by sortOrder, then title, then id", () => {
    const roots = buildPageTree([
      page("z", null, 2),
      page("a", null, 1),
      page("m", null, 1, { title: "m" }),
      page("b", null, 1, { title: "b" }),
    ]);
    // sortOrder 1 group first, ordered by title: a, b, m; then z (sortOrder 2)
    expect(roots.map((n) => n.id)).toEqual(["a", "b", "m", "z"]);
  });

  it("surfaces an orphan (missing parent) as a root rather than dropping it", () => {
    const tree = buildPageTree([page("orphan", "ghost"), page("real", null)]);
    expect(tree.map((n) => n.id).sort()).toEqual(["orphan", "real"]);
  });

  it("does not loop when a page points at itself", () => {
    const tree = buildPageTree([page("self", "self")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("self");
    expect(tree[0].children).toHaveLength(0);
  });

  it("returns an empty forest for no pages", () => {
    expect(buildPageTree([])).toEqual([]);
  });
});

describe("flattenTree", () => {
  it("walks parents before children, in order", () => {
    const tree = buildPageTree([
      page("a", null, 0),
      page("a1", "a", 0),
      page("a2", "a", 1),
      page("b", null, 1),
    ]);
    expect(flattenTree(tree).map((n) => n.id)).toEqual(["a", "a1", "a2", "b"]);
  });
});

describe("topLevelNodes", () => {
  const tree = buildPageTree([
    page("a", null, 0),
    page("b", null, 1),
    page("a1", "a", 0),
    page("a2", "a", 1),
    page("a1x", "a1", 0),
  ]);

  it("returns the roots of a forest, in order", () => {
    expect(topLevelNodes(tree).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("keeps only depth-0 nodes when handed a flattened list", () => {
    expect(topLevelNodes(flattenTree(tree)).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("is empty for an empty forest", () => {
    expect(topLevelNodes([])).toEqual([]);
  });
});

describe("collectSubtreeIds", () => {
  const pages = [
    page("root", null),
    page("c1", "root"),
    page("c2", "root"),
    page("g1", "c1"),
    page("other", null),
  ];

  it("collects a page and all its descendants", () => {
    expect(collectSubtreeIds(pages, "root").sort()).toEqual(["c1", "c2", "g1", "root"]);
  });

  it("collects a leaf as a subtree of one", () => {
    expect(collectSubtreeIds(pages, "g1")).toEqual(["g1"]);
  });

  it("does not reach into other branches", () => {
    expect(collectSubtreeIds(pages, "c1").sort()).toEqual(["c1", "g1"]);
    expect(collectSubtreeIds(pages, "c1")).not.toContain("other");
  });
});

describe("planMove", () => {
  // Three top-level pages, and two children under "a".
  const pages = [
    page("a", null, 0),
    page("b", null, 1),
    page("c", null, 2),
    page("a1", "a", 0),
    page("a2", "a", 1),
  ];

  it("reorders siblings — moving c before a re-indexes the whole level", () => {
    const plan = planMove(pages, "c", null, "a");
    expect(plan).not.toBeNull();
    expect(plan!.parentId).toBeNull();
    expect(plan!.updates).toEqual([
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });

  it("appends to the end when beforeId is null", () => {
    const plan = planMove(pages, "a", null, null);
    expect(plan!.updates).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "c", sortOrder: 1 },
      { id: "a", sortOrder: 2 },
    ]);
  });

  it("nests a page into a new parent, appended after existing children", () => {
    const plan = planMove(pages, "b", "a", null);
    expect(plan!.parentId).toBe("a");
    expect(plan!.updates).toEqual([
      { id: "a1", sortOrder: 0 },
      { id: "a2", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });

  it("nests before a specific sibling", () => {
    const plan = planMove(pages, "b", "a", "a2");
    expect(plan!.updates).toEqual([
      { id: "a1", sortOrder: 0 },
      { id: "b", sortOrder: 1 },
      { id: "a2", sortOrder: 2 },
    ]);
  });

  it("moves a nested page back out to the root", () => {
    const plan = planMove(pages, "a1", null, "b");
    expect(plan!.parentId).toBeNull();
    expect(plan!.updates).toEqual([
      { id: "a", sortOrder: 0 },
      { id: "a1", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
      { id: "c", sortOrder: 3 },
    ]);
  });

  it("refuses to drop a page onto itself", () => {
    expect(planMove(pages, "a", "a", null)).toBeNull();
  });

  it("refuses to drop a page into its own descendant (would orphan the subtree)", () => {
    const deep = [
      page("root", null, 0),
      page("mid", "root", 0),
      page("leaf", "mid", 0),
    ];
    expect(planMove(deep, "root", "leaf", null)).toBeNull();
    expect(planMove(deep, "root", "mid", null)).toBeNull();
  });

  it("keeps moves inside the same teamspace (clientId) scope", () => {
    const mixed = [
      page("x", null, 0, { clientId: "c1" }),
      page("y", null, 1, { clientId: "c1" }),
      page("z", null, 0, { clientId: "c2" }),
    ];
    // Moving x to the end of its (c1) level ignores the c2 page entirely.
    const plan = planMove(mixed, "x", null, null);
    expect(plan!.updates).toEqual([
      { id: "y", sortOrder: 0 },
      { id: "x", sortOrder: 1 },
    ]);
  });

  it("returns null for an unknown page", () => {
    expect(planMove(pages, "ghost", null, null)).toBeNull();
  });
});

describe("pageBreadcrumb", () => {
  const pages = [
    page("root", null, 0, { title: "Root" }),
    page("mid", "root", 0, { title: "Mid" }),
    page("leaf", "mid", 0, { title: "Leaf" }),
  ];

  it("returns the ancestor chain, teamspace-nearest first, self last", () => {
    expect(pageBreadcrumb(pages, "leaf").map((p) => p.id)).toEqual([
      "root",
      "mid",
      "leaf",
    ]);
  });

  it("is just the page itself for a top-level page", () => {
    expect(pageBreadcrumb(pages, "root").map((p) => p.id)).toEqual(["root"]);
  });

  it("is empty for an unknown id", () => {
    expect(pageBreadcrumb(pages, "nope")).toEqual([]);
  });
});

describe("findNodeByTitle", () => {
  const tree = buildPageTree([
    page("root", null, 0, { title: "Onboarding" }),
    page("timeline", null, 1, { title: "Global Ventures Timeline" }),
    page("child", "root", 0, { title: "Software Logins" }),
    page("deep", "child", 0, { title: "Client Roadmap" }),
  ]);

  it("finds a top-level page by exact title", () => {
    expect(findNodeByTitle(tree, "Global Ventures Timeline")?.id).toBe("timeline");
  });

  it("matches case-insensitively", () => {
    expect(findNodeByTitle(tree, "onboarding")?.id).toBe("root");
    expect(findNodeByTitle(tree, "SOFTWARE LOGINS")?.id).toBe("child");
  });

  it("searches the whole tree, including deeply nested pages", () => {
    expect(findNodeByTitle(tree, "Client Roadmap")?.id).toBe("deep");
  });

  it("ignores surrounding whitespace on both sides", () => {
    expect(findNodeByTitle(tree, "  Onboarding  ")?.id).toBe("root");
  });

  it("returns null when no page has that title", () => {
    expect(findNodeByTitle(tree, "Nonexistent Page")).toBeNull();
  });

  it("returns null for an empty forest", () => {
    expect(findNodeByTitle([], "Onboarding")).toBeNull();
  });

  it("returns the first match in render order (parent before child)", () => {
    const dup = buildPageTree([
      page("p", null, 0, { title: "Resources" }),
      page("c", "p", 0, { title: "Resources" }),
    ]);
    expect(findNodeByTitle(dup, "Resources")?.id).toBe("p");
  });
});
