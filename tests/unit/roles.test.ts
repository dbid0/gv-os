import { describe, expect, it } from "vitest";

import {
  canAccessRoute,
  guardTarget,
  roleFromTeamRows,
  roleHome,
  ROLES,
} from "@/lib/auth/roles";

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

describe("home routing contract", () => {
  it("managers land on the Coach home; admins can reach it too", () => {
    expect(roleHome("sales_manager")).toBe("/home/manager");
    expect(canAccessRoute("sales_manager", "/home/manager")).toBe(true);
    // Admin is all-access, so the Coach board is open to it as well.
    expect(canAccessRoute("admin", "/home/manager")).toBe(true);
  });

  it("a sales rep (Wingman) lands on the member home, not the manager board", () => {
    expect(roleHome("sales_rep")).toBe("/home/member");
    expect(canAccessRoute("sales_rep", "/home/member")).toBe(true);
    // The rep's own Wingman board lives under /home/member/<repId>.
    expect(canAccessRoute("sales_rep", "/home/member/rep-123")).toBe(true);
    // Reps no longer hold the manager board.
    expect(canAccessRoute("sales_rep", "/home/manager")).toBe(false);
  });

  it("a team member also lands on the member home", () => {
    expect(roleHome("team_member")).toBe("/home/member");
    expect(canAccessRoute("team_member", "/home/member")).toBe(true);
  });

  it("a rep reaches its member home but is still 307'd off the money", () => {
    expect(guardTarget("sales_rep", "/home/member")).toBeNull();
    expect(guardTarget("sales_rep", "/accounting")).toBe("/home/member");
    expect(guardTarget("sales_rep", "/accounting/payouts")).toBe("/home/member");
    // A rep still keeps its sales sub-routes.
    expect(guardTarget("sales_rep", "/sales/eod/submit")).toBeNull();
  });

  it("owners (daniel@/gus@) and any unmapped allowlisted email stay admin", () => {
    // Owners never sit in team_members with a narrower role, so their lookup
    // returns zero rows -> admin — full access, unchanged by this contract.
    expect(roleFromTeamRows([])).toBe("admin");
    expect(canAccessRoute("admin", "/accounting/payouts")).toBe(true);
    expect(canAccessRoute("admin", "/settings/integrations")).toBe(true);
  });
});

/**
 * The "View as" preview trap.
 *
 * A preview cookie narrows the effective role, and `guardTarget` then bounces
 * EVERY route to that role's home. Previewing a client therefore pins the owner
 * inside one workspace — which is exactly what happened to Daniel: every route
 * 307'd to /w/the-grid and he could not get back to the app. The escape hatch
 * (/exit-preview, handled in the middleware before auth and before the guard)
 * is what makes that recoverable, so it must never become guardable.
 */
describe("client preview traps every route (why /exit-preview exists)", () => {
  it("bounces an admin previewing a client off admin routes to that workspace", () => {
    expect(guardTarget("client", "/dashboard", "the-grid")).toBe("/w/the-grid");
    expect(guardTarget("client", "/sales", "the-grid")).toBe("/w/the-grid");
    expect(guardTarget("client", "/clients", "the-grid")).toBe("/w/the-grid");
  });

  it("lets the previewed workspace itself through", () => {
    expect(guardTarget("client", "/w/the-grid", "the-grid")).toBeNull();
    expect(guardTarget("client", "/w/the-grid/sales", "the-grid")).toBeNull();
  });

  it("never lets a client role wander into ANOTHER client's workspace", () => {
    expect(guardTarget("client", "/w/the-vault", "the-grid")).toBe("/w/the-grid");
  });

  it("leaves a real admin (no preview) alone everywhere", () => {
    expect(guardTarget("admin", "/dashboard", null)).toBeNull();
    expect(guardTarget("admin", "/w/the-grid", null)).toBeNull();
  });
});
