import { describe, expect, it } from "vitest";

import {
  AI_FACES,
  AI_ROLES,
  adminOnlyLeaks,
  aiFace,
  capabilitiesForRole,
  isAiRole,
  roleHasCapability,
} from "@/lib/ai/roles";

describe("ai roles", () => {
  it("gives exactly three faces with the right names", () => {
    expect(AI_ROLES).toEqual(["admin", "sales_manager", "sales_rep"]);
    expect(aiFace("admin").name).toBe("Operator");
    expect(aiFace("sales_manager").name).toBe("Coach");
    expect(aiFace("sales_rep").name).toBe("Wingman");
    // Every face carries a tagline.
    for (const role of AI_ROLES) {
      expect(AI_FACES[role].tagline.length).toBeGreaterThan(0);
    }
  });

  it("scopes capabilities as a strict ladder rep ⊂ manager ⊂ admin", () => {
    const rep = capabilitiesForRole("sales_rep");
    const manager = capabilitiesForRole("sales_manager");
    const admin = capabilitiesForRole("admin");

    expect(rep).toEqual(["read.own", "write.activity"]);
    for (const cap of rep) expect(manager).toContain(cap);
    for (const cap of manager) expect(admin).toContain(cap);
    expect(admin).toContain("read.all");
  });

  it("returns a fresh capability array callers cannot mutate", () => {
    const a = capabilitiesForRole("sales_rep");
    a.push("read.all");
    expect(capabilitiesForRole("sales_rep")).toEqual(["read.own", "write.activity"]);
  });

  it("roleHasCapability answers truthfully both ways", () => {
    expect(roleHasCapability("admin", "write.money")).toBe(true);
    expect(roleHasCapability("admin", "dev.inspect")).toBe(true);
    expect(roleHasCapability("sales_manager", "write.coaching")).toBe(true);
    expect(roleHasCapability("sales_manager", "write.money")).toBe(false);
    expect(roleHasCapability("sales_rep", "write.money")).toBe(false);
    expect(roleHasCapability("sales_rep", "read.team")).toBe(false);
  });

  it("isAiRole accepts the three, rejects everything else", () => {
    expect(isAiRole("admin")).toBe(true);
    expect(isAiRole("sales_rep")).toBe(true);
    expect(isAiRole("team_member")).toBe(false);
    expect(isAiRole("client")).toBe(false);
    expect(isAiRole(null)).toBe(false);
    expect(isAiRole(undefined)).toBe(false);
  });

  it("adminOnlyLeaks: the real map is clean, and the detector actually fires", () => {
    // The guarantee: no non-admin role holds an admin-only capability.
    expect(adminOnlyLeaks()).toEqual([]);
    // Fed a leaky map, it reports the leak (and ignores unset roles).
    const leaks = adminOnlyLeaks({ sales_rep: ["read.own", "write.money"] });
    expect(leaks).toEqual([{ role: "sales_rep", capability: "write.money" }]);
  });
});
