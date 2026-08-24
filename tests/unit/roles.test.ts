import { describe, expect, it } from "vitest";

import { canAccessRoute, ROLES } from "@/lib/auth/roles";

describe("canAccessRoute", () => {
  it("admin opens everything", () => {
    for (const path of [
      "/dashboard",
      "/accounting/reconciliation",
      "/settings/integrations",
      "/clients/the-grid",
      "/email",
    ]) {
      expect(canAccessRoute("admin", path)).toBe(true);
    }
  });

  it("no non-admin role can reach accounting or settings", () => {
    for (const role of ROLES.filter((r) => r !== "admin")) {
      expect(canAccessRoute(role, "/accounting")).toBe(false);
      expect(canAccessRoute(role, "/accounting/reconciliation")).toBe(false);
      expect(canAccessRoute(role, "/settings/integrations")).toBe(false);
    }
  });

  it("sales roles get the sales section, team members get boards", () => {
    expect(canAccessRoute("sales_manager", "/sales/leaderboard")).toBe(true);
    expect(canAccessRoute("sales_manager", "/notifications")).toBe(true);
    expect(canAccessRoute("sales_rep", "/sales/eod/submit")).toBe(true);
    expect(canAccessRoute("sales_rep", "/team")).toBe(false);
    expect(canAccessRoute("team_member", "/team/some-member-id")).toBe(true);
    expect(canAccessRoute("team_member", "/sales")).toBe(false);
    // The admin dashboard is the ADMIN home — team roles have their own.
    expect(canAccessRoute("sales_manager", "/dashboard")).toBe(false);
    expect(canAccessRoute("team_member", "/dashboard")).toBe(false);
  });

  it("the AI assistant is open to sales roles and admin, closed to the rest", () => {
    expect(canAccessRoute("admin", "/assistant")).toBe(true);
    expect(canAccessRoute("sales_manager", "/assistant")).toBe(true);
    expect(canAccessRoute("sales_rep", "/assistant")).toBe(true);
    expect(canAccessRoute("team_member", "/assistant")).toBe(false);
    expect(canAccessRoute("client", "/assistant")).toBe(false);
  });

  it("clients get only their workspace lane and profile", () => {
    expect(canAccessRoute("client", "/dashboard")).toBe(false);
    expect(canAccessRoute("client", "/profile")).toBe(true);
    expect(canAccessRoute("client", "/w/the-vault")).toBe(true);
    expect(canAccessRoute("client", "/sales")).toBe(false);
    expect(canAccessRoute("client", "/email")).toBe(false);
  });

  it("prefix matching never over-grants on lookalike paths", () => {
    expect(canAccessRoute("client", "/dashboards-secret")).toBe(false);
    expect(canAccessRoute("team_member", "/teammates")).toBe(false);
  });

  it("ignores query strings", () => {
    expect(canAccessRoute("client", "/w/the-vault?range=life")).toBe(true);
  });
});
