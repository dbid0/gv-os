import { describe, expect, it } from "vitest";

import {
  copiedParentId,
  planTemplateCopy,
  remapPageLinks,
  type TemplatePage,
} from "@/lib/workspace/template";

function page(
  id: string,
  parentId: string | null = null,
  extra: Partial<TemplatePage> = {},
): TemplatePage {
  return {
    id,
    parentId,
    title: id,
    icon: null,
    content: null,
    sortOrder: 0,
    ...extra,
  };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("remapPageLinks", () => {
  it("re-points an internal link at the copied page", () => {
    const map = new Map([[uuid(1), uuid(9)]]);
    expect(remapPageLinks(`See [x](?page=${uuid(1)})`, map)).toBe(
      `See [x](?page=${uuid(9)})`,
    );
  });

  it("re-points every occurrence, including repeats", () => {
    const map = new Map([
      [uuid(1), uuid(9)],
      [uuid(2), uuid(8)],
    ]);
    const before = `a(?page=${uuid(1)}) b(?page=${uuid(2)}) c(?page=${uuid(1)})`;
    expect(remapPageLinks(before, map)).toBe(
      `a(?page=${uuid(9)}) b(?page=${uuid(8)}) c(?page=${uuid(9)})`,
    );
  });

  it("LEAVES a link alone when its target was not copied", () => {
    // Linking out of the template must keep working, not break.
    const map = new Map([[uuid(1), uuid(9)]]);
    const before = `out(?page=${uuid(5)})`;
    expect(remapPageLinks(before, map)).toBe(before);
  });

  it("is null/empty safe and leaves unrelated text untouched", () => {
    expect(remapPageLinks(null, new Map())).toBeNull();
    expect(remapPageLinks("", new Map())).toBe("");
    expect(remapPageLinks("no links here", new Map())).toBe("no links here");
  });
});

describe("planTemplateCopy", () => {
  it("always orders a parent before its children", () => {
    const pages = [page("c", "b"), page("b", "a"), page("a", null)];
    const order = planTemplateCopy(pages).map((p) => p.id);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  });

  it("treats a parent OUTSIDE the subtree as a re-root, not a blocker", () => {
    // "a" is the template root: its parent lives outside the copied set.
    const pages = [page("a", "outside"), page("b", "a")];
    const order = planTemplateCopy(pages).map((p) => p.id);
    expect(order).toEqual(["a", "b"]);
  });

  it("keeps every page exactly once", () => {
    const pages = [page("a"), page("b", "a"), page("c", "a"), page("d", "b")];
    const order = planTemplateCopy(pages);
    expect(order).toHaveLength(4);
    expect(new Set(order.map((p) => p.id)).size).toBe(4);
  });

  it("throws on a cycle rather than looping forever", () => {
    const pages = [page("a", "b"), page("b", "a")];
    expect(() => planTemplateCopy(pages)).toThrow(/cycle/i);
  });

  it("handles an empty set", () => {
    expect(planTemplateCopy([])).toEqual([]);
  });
});

describe("copiedParentId", () => {
  it("points a child at its parent's COPY", () => {
    const map = new Map([["a", "A"]]);
    expect(copiedParentId(page("b", "a"), map)).toBe("A");
  });

  it("re-roots to top level when the parent was not copied", () => {
    expect(copiedParentId(page("a", "outside"), new Map())).toBeNull();
    expect(copiedParentId(page("a", null), new Map())).toBeNull();
  });
});
