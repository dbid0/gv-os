import { describe, expect, it } from "vitest";

import { isDescendantOrSelf } from "@/lib/workspace/tree";

/**
 * The public-share guard: a shared token exposes one page and its descendants,
 * NEVER a parent, a sibling, or another teamspace. `isDescendantOrSelf` is the
 * pure check the server runs on every `?p=` param, so this is the security test
 * for the whole feature.
 */

// A small forest across two teamspaces:
//   root
//   ├── a
//   │   └── a1
//   └── b
//   sibling            (shares root's parent = none, i.e. a top-level peer)
//   other-root (a different teamspace) → other-child
const pages = [
  { id: "root", parentId: null },
  { id: "a", parentId: "root" },
  { id: "a1", parentId: "a" },
  { id: "b", parentId: "root" },
  { id: "sibling", parentId: null },
  { id: "other-root", parentId: null },
  { id: "other-child", parentId: "other-root" },
];

describe("isDescendantOrSelf", () => {
  it("allows the shared root itself", () => {
    expect(isDescendantOrSelf(pages, "root", "root")).toBe(true);
  });

  it("allows a direct child", () => {
    expect(isDescendantOrSelf(pages, "root", "a")).toBe(true);
    expect(isDescendantOrSelf(pages, "root", "b")).toBe(true);
  });

  it("allows a deep descendant", () => {
    expect(isDescendantOrSelf(pages, "root", "a1")).toBe(true);
  });

  it("rejects a top-level sibling of the shared root", () => {
    expect(isDescendantOrSelf(pages, "root", "sibling")).toBe(false);
  });

  it("rejects a page in another teamspace", () => {
    expect(isDescendantOrSelf(pages, "root", "other-root")).toBe(false);
    expect(isDescendantOrSelf(pages, "root", "other-child")).toBe(false);
  });

  it("rejects an ancestor when sharing a deeper page", () => {
    // Share "a": its parent "root" and uncle "b" must be out of bounds.
    expect(isDescendantOrSelf(pages, "a", "root")).toBe(false);
    expect(isDescendantOrSelf(pages, "a", "b")).toBe(false);
    // …but "a" and its own child stay in bounds.
    expect(isDescendantOrSelf(pages, "a", "a")).toBe(true);
    expect(isDescendantOrSelf(pages, "a", "a1")).toBe(true);
  });

  it("rejects an unknown candidate id", () => {
    expect(isDescendantOrSelf(pages, "root", "does-not-exist")).toBe(false);
  });
});
