import { describe, expect, it } from "vitest";

import {
  buildPageTree,
  collectSubtreeIds,
  flattenTree,
  pageBreadcrumb,
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
