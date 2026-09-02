import { describe, expect, it } from "vitest";

import {
  copiedParentId,
  hasOnboardingSpace,
  onboardingRootIcon,
  onboardingSpaceTitle,
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

describe("onboardingSpaceTitle", () => {
  it("names the section after the client", () => {
    expect(onboardingSpaceTitle("The Grid")).toBe("The Grid Onboarding");
  });

  it("matches the convention The Visionary already uses", () => {
    expect(onboardingSpaceTitle("The Visionary")).toBe("The Visionary Onboarding");
  });

  it("trims stray whitespace from the client name", () => {
    expect(onboardingSpaceTitle("  Racks Closes ")).toBe("Racks Closes Onboarding");
  });
});

describe("hasOnboardingSpace", () => {
  it("is false for a teamspace holding only imported Notion pages", () => {
    // The Grid's real import: 13 SOP pages, no onboarding section. This
    // returning TRUE (because pages existed at all) is why it never got one.
    const grid = ["Start Here", "Closers SOPs", "Scripts Hub", "Kaden's Story"];
    expect(hasOnboardingSpace(grid, "The Grid")).toBe(false);
  });

  it("is true once the client-named section exists", () => {
    expect(hasOnboardingSpace(["The Grid Onboarding"], "The Grid")).toBe(true);
  });

  it("still recognises a section seeded under the OLD factory title", () => {
    // Racks Closes was seeded before the rename — it must not get a second copy.
    expect(hasOnboardingSpace(["Client Template"], "Racks Closes")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(hasOnboardingSpace(["  the grid onboarding  "], "The Grid")).toBe(true);
  });

  it("does not match another client's section", () => {
    expect(hasOnboardingSpace(["The Vault Onboarding"], "The Grid")).toBe(false);
  });

  it("is false for an empty teamspace", () => {
    expect(hasOnboardingSpace([], "The Grid")).toBe(false);
  });
});

describe("onboardingRootIcon", () => {
  const TEMPLATE = "https://cdn.example.com/gv-logo.png";

  it("prefers the client's own mark when it is a real image URL", () => {
    const logo = "https://cdn.example.com/grid.png";
    expect(onboardingRootIcon(logo, TEMPLATE)).toBe(logo);
  });

  it("REFUSES a base64 data URL, which the icon renderer cannot draw", () => {
    // Client logos are stored as data: URLs. isImageIcon matches only http(s)
    // and app-relative paths, so passing one through would render ~38KB of
    // base64 as the icon's visible label.
    const dataUrl = "data:image/png;base64," + "A".repeat(200);
    expect(onboardingRootIcon(dataUrl, TEMPLATE)).toBe(TEMPLATE);
  });

  it("accepts an app-relative logo path", () => {
    expect(onboardingRootIcon("/logos/grid.png", TEMPLATE)).toBe("/logos/grid.png");
  });

  it("falls back to the template icon when the client has no logo", () => {
    expect(onboardingRootIcon(null, TEMPLATE)).toBe(TEMPLATE);
  });

  it("returns null when neither is usable", () => {
    expect(onboardingRootIcon(null, null)).toBeNull();
    expect(onboardingRootIcon("data:image/png;base64,AAAA", null)).toBeNull();
  });
});
