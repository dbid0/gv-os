import { describe, expect, it } from "vitest";

import { allowedEmails, isAllowed } from "@/lib/auth/allowlist";

describe("allowlist", () => {
  it("defaults to Daniel and Gus when nothing is configured", () => {
    expect(allowedEmails("")).toEqual([
      "daniel@globalventures.app",
      "gus@globalventures.app",
    ]);
    expect(allowedEmails(undefined)).toHaveLength(2);
  });

  it("admits the two real addresses", () => {
    expect(isAllowed("daniel@globalventures.app", "")).toBe(true);
    expect(isAllowed("gus@globalventures.app", "")).toBe(true);
  });

  it("is case and whitespace insensitive, because email is", () => {
    expect(isAllowed("  Daniel@GlobalVentures.App  ", "")).toBe(true);
    expect(isAllowed("GUS@GLOBALVENTURES.APP", "")).toBe(true);
  });

  it("rejects everyone else", () => {
    expect(isAllowed("someone@else.com", "")).toBe(false);
    expect(isAllowed("daniel@gmail.com", "")).toBe(false);
    // Not a wildcard on the domain: only listed addresses get in.
    expect(isAllowed("intern@globalventures.app", "")).toBe(false);
  });

  it("rejects empty, null, and undefined rather than defaulting open", () => {
    expect(isAllowed(null, "")).toBe(false);
    expect(isAllowed(undefined, "")).toBe(false);
    expect(isAllowed("", "")).toBe(false);
    expect(isAllowed("   ", "")).toBe(false);
  });

  it("can be reconfigured without a code change", () => {
    const configured = "a@globalventures.app, b@globalventures.app";
    expect(allowedEmails(configured)).toEqual([
      "a@globalventures.app",
      "b@globalventures.app",
    ]);
    expect(isAllowed("a@globalventures.app", configured)).toBe(true);
    // Reconfiguring REPLACES the defaults, so a removed person is really out.
    expect(isAllowed("daniel@globalventures.app", configured)).toBe(false);
  });

  it("falls back to the defaults rather than locking everyone out on a blank value", () => {
    expect(isAllowed("daniel@globalventures.app", "   ,  , ")).toBe(true);
  });
});
