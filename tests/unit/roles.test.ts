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
    expect(canAccessRoute("sales_rep", "/sales/eod/submit")).toBe(true);
    expect(canAccessRoute("sales_rep", "/team")).toBe(false);
    expect(canAccessRoute("team_member", "/action-list")).toBe(true);
    expect(canAccessRoute("team_member", "/team/some-member-id")).toBe(true);
    expect(canAccessRoute("team_member", "/sales")).toBe(false);
  });

  it("clients see only the dashboard and profile", () => {
    expect(canAccessRoute("client", "/dashboard")).toBe(true);
    expect(canAccessRoute("client", "/profile")).toBe(true);
    expect(canAccessRoute("client", "/sales")).toBe(false);
    expect(canAccessRoute("client", "/email")).toBe(false);
  });

  it("prefix matching never over-grants on lookalike paths", () => {
    expect(canAccessRoute("client", "/dashboards-secret")).toBe(false);
    expect(canAccessRoute("team_member", "/teammates")).toBe(false);
  });

  it("ignores query strings", () => {
    expect(canAccessRoute("client", "/dashboard?tab=x")).toBe(true);
  });
});
