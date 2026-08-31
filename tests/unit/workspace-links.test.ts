import { describe, expect, it } from "vitest";

import {
  isInternalPageHref,
  linkifyTaskText,
  SHEET_LINK_TITLES,
} from "@/lib/workspace/links";

describe("isInternalPageHref", () => {
  const base = "/clients/foo/workspace";

  it("reads a relative ?page= link as the page id", () => {
    expect(isInternalPageHref("?page=abc", base)).toBe("abc");
  });

  it("reads an absolute copy-link URL to the same base path", () => {
    expect(
      isInternalPageHref(
        "https://os.globalventures.app/clients/foo/workspace?page=xyz",
        base,
      ),
    ).toBe("xyz");
  });

  it("tolerates a trailing slash on either side", () => {
    expect(isInternalPageHref("/clients/foo/workspace/?page=abc", base)).toBe("abc");
    expect(isInternalPageHref("?page=abc", "/clients/foo/workspace/")).toBe("abc");
  });

  it("works on the agency route", () => {
    expect(isInternalPageHref("?page=q", "/workspace")).toBe("q");
  });

  it("returns null for a link to another route (different path)", () => {
    expect(isInternalPageHref("/clients/bar/workspace?page=abc", base)).toBeNull();
    expect(isInternalPageHref("/accounting?page=abc", base)).toBeNull();
  });

  it("returns null when there is no page param", () => {
    expect(isInternalPageHref("/clients/foo/workspace", base)).toBeNull();
    expect(isInternalPageHref("?tab=notes", base)).toBeNull();
  });

  it("returns null for external sites, fragments, and non-http schemes", () => {
    expect(isInternalPageHref("https://example.com/page", base)).toBeNull();
    expect(isInternalPageHref("#section", base)).toBeNull();
    expect(isInternalPageHref("mailto:hi@x.com", base)).toBeNull();
    expect(isInternalPageHref("", base)).toBeNull();
    expect(isInternalPageHref(null, base)).toBeNull();
  });

  it("ignores an empty page value", () => {
    expect(isInternalPageHref("?page=", base)).toBeNull();
  });
});

describe("linkifyTaskText", () => {
  // Every known sheet resolves to `${title}-id`; anything else is unresolved.
  const resolveAll = (title: string) =>
    (SHEET_LINK_TITLES as readonly string[]).includes(title) ? `${title}-id` : null;

  it("splits a task around a known, resolvable sheet name", () => {
    const out = linkifyTaskText("Fill out Software Logins", resolveAll);
    expect(out).not.toBeNull();
    expect(out?.before).toBe("Fill out ");
    expect(out?.link.text).toBe("Software Logins");
    expect(out?.link.pageId).toBe("Software Logins-id");
    expect(out?.after).toBe("");
  });

  it("keeps the task's own casing on the linked span", () => {
    const out = linkifyTaskText("fill out software logins today", resolveAll);
    expect(out?.link.text).toBe("software logins");
    expect(out?.after).toBe(" today");
  });

  it("handles the other seeded sheets", () => {
    expect(linkifyTaskText("Fill out Brand Sheets", resolveAll)?.link.text).toBe(
      "Brand Sheets",
    );
    expect(linkifyTaskText("Fill out Client Roadmap", resolveAll)?.link.text).toBe(
      "Client Roadmap",
    );
  });

  it("returns null when no known sheet name appears", () => {
    expect(linkifyTaskText("Buy milk", resolveAll)).toBeNull();
  });

  it("returns null when the sheet name has no page (render plain text)", () => {
    expect(linkifyTaskText("Fill out Software Logins", () => null)).toBeNull();
  });

  it("skips an unresolvable earlier match for a resolvable later one", () => {
    const resolveOnlyRoadmap = (title: string) =>
      title === "Client Roadmap" ? "roadmap-id" : null;
    const out = linkifyTaskText(
      "Software Logins then Client Roadmap",
      resolveOnlyRoadmap,
    );
    expect(out?.link.text).toBe("Client Roadmap");
    expect(out?.before).toBe("Software Logins then ");
  });
});
