import { describe, expect, it } from "vitest";

import { accentFromSlug } from "@/lib/roster-server";

describe("accentFromSlug", () => {
  it("is stable — same slug, same colour, forever", () => {
    expect(accentFromSlug("new-client")).toBe(accentFromSlug("new-client"));
  });

  it("differs across slugs", () => {
    expect(accentFromSlug("alpha")).not.toBe(accentFromSlug("omega"));
  });

  it("is a real hsl colour", () => {
    expect(accentFromSlug("anything")).toMatch(/^hsl\(\d{1,3} 70% 55%\)$/);
  });
});
