import { describe, expect, it } from "vitest";

import {
  effectiveRole,
  guardTarget,
  roleFromTeamRows,
  roleHome,
  type Role,
} from "@/lib/auth/roles";
import type { MemberRoleShape } from "@/lib/team-roles";

/**
 * The safety net for per-user roles. These are the pure decisions the
 * middleware guard, the shell nav, and the AI scope all share — so proving them
 * here proves the whole story:
 *   1. owners + any unmapped allowlisted email  -> admin, full access
 *   2. a mapped sales_manager                    -> restricted off the money
 *   3. the "View as" preview can only NARROW, never widen
 *   4. the money routes stay isolated from every narrower role
 */

const manager: MemberRoleShape = {
  role: "manager",
  roleKey: "sales_manager",
  repKind: null,
};
const closer: MemberRoleShape = {
  role: "closer",
  roleKey: "sales_rep",
  repKind: "closer",
};
const operator: MemberRoleShape = { role: "operator", roleKey: "admin", repKind: null };
const copywriter: MemberRoleShape = {
  role: "copywriter",
  roleKey: "team_member",
  repKind: null,
};

describe("roleFromTeamRows — the safe default", () => {
  it("owners and any UNMAPPED allowlisted email resolve to admin", () => {
    // daniel@ and gus@globalventures.app are never in team_members with a
    // narrower role, so their lookup returns zero rows -> admin. Same for any
    // future allowlisted address nobody has mapped yet.
    expect(roleFromTeamRows([])).toBe("admin");
  });

  it("a mapped sales_manager resolves to sales_manager", () => {
    expect(roleFromTeamRows([manager])).toBe("sales_manager");
  });

  it("a mapped sales rep resolves to sales_rep, a team member to team_member", () => {
    expect(roleFromTeamRows([closer])).toBe("sales_rep");
    expect(roleFromTeamRows([copywriter])).toBe("team_member");
  });

  it("an explicit admin team row resolves to admin", () => {
    expect(roleFromTeamRows([operator])).toBe("admin");
  });

  it("infers a legacy row (no role_key) from its job title", () => {
    expect(roleFromTeamRows([{ role: "manager", roleKey: null, repKind: null }])).toBe(
      "sales_manager",
    );
  });

  it("when several rows match, the WIDEST role wins — ambiguity never restricts", () => {
    expect(roleFromTeamRows([manager, operator])).toBe("admin");
    expect(roleFromTeamRows([copywriter, closer])).toBe("sales_rep");
  });
});

describe("effectiveRole — restrict-only preview", () => {
  it("lets an admin preview a NARROWER role", () => {
    expect(effectiveRole("admin", "sales_manager")).toBe("sales_manager");
    expect(effectiveRole("admin", "sales_rep")).toBe("sales_rep");
    expect(effectiveRole("admin", "client")).toBe("client");
  });

  it("keeps admin when there is no preview", () => {
    expect(effectiveRole("admin", null)).toBe("admin");
  });

  it("a non-admin IGNORES the preview cookie — it can never widen", () => {
    // A forged gv-dev-role=admin on a manager account grants nothing.
    expect(effectiveRole("sales_manager", "admin")).toBe("sales_manager");
    expect(effectiveRole("sales_rep", "admin")).toBe("sales_rep");
    expect(effectiveRole("team_member", "sales_manager")).toBe("team_member");
  });
});

describe("guardTarget — the route guard the middleware runs", () => {
  const guard = (
    real: Role,
    path: string,
    preview: Role | null = null,
    slug?: string,
  ) => guardTarget(effectiveRole(real, preview), path, slug);

  it("an owner/unmapped admin reaches everything, money included", () => {
    for (const path of [
      "/dashboard",
      "/accounting",
      "/accounting/payouts",
      "/accounting/reconciliation",
      "/settings/integrations",
      "/sales/leaderboard",
    ]) {
      expect(guard("admin", path)).toBeNull();
    }
  });

  it("a mapped sales_manager is 307'd OFF accounting and payouts to the Coach home", () => {
    expect(guard("sales_manager", "/accounting")).toBe("/home/manager");
    expect(guard("sales_manager", "/accounting/payouts")).toBe("/home/manager");
    // The partner-split lives under accounting, so it is blocked too.
    expect(guard("sales_manager", "/accounting/reconciliation")).toBe("/home/manager");
    expect(guard("sales_manager", "/dashboard")).toBe("/home/manager");
  });

  it("a sales_manager keeps their own home and the sales floor", () => {
    expect(guard("sales_manager", "/home/manager")).toBeNull();
    expect(guard("sales_manager", "/sales")).toBeNull();
    expect(guard("sales_manager", "/sales/leaderboard")).toBeNull();
    expect(guard("sales_manager", "/assistant")).toBeNull();
  });

  it("MONEY routes are isolated from EVERY narrower role", () => {
    for (const role of [
      "sales_manager",
      "sales_rep",
      "team_member",
      "client",
    ] as Role[]) {
      for (const path of ["/accounting", "/accounting/payouts", "/settings"]) {
        expect(guardTarget(role, path)).not.toBeNull();
      }
    }
  });

  it("a forged admin cookie on a manager account still cannot reach the money", () => {
    expect(guard("sales_manager", "/accounting/payouts", "admin")).toBe(
      "/home/manager",
    );
  });

  it("an admin previewing a manager IS bounced off accounting (preview narrows)", () => {
    expect(guard("admin", "/accounting", "sales_manager")).toBe("/home/manager");
    expect(guard("admin", "/dashboard", "sales_manager")).toBe("/home/manager");
  });

  it("pins a client to their one workspace, everything else to their front door", () => {
    expect(guardTarget("client", "/dashboard", "the-vault")).toBe("/w/the-vault");
    expect(guardTarget("client", "/w/the-vault", "the-vault")).toBeNull();
    expect(guardTarget("client", "/w/the-vault/reels", "the-vault")).toBeNull();
    expect(guardTarget("client", "/profile", "the-vault")).toBeNull();
    expect(guardTarget("client", "/accounting", "the-vault")).toBe("/w/the-vault");
  });
});

describe("roleHome", () => {
  it("sends the manager to the Coach home, reps and team members to the member home", () => {
    // Managers run the Coach board; reps (Wingman) and other team members land
    // on the member board — the page is viewer-aware and renders the right one.
    expect(roleHome("sales_manager")).toBe("/home/manager");
    expect(roleHome("sales_rep")).toBe("/home/member");
    expect(roleHome("team_member")).toBe("/home/member");
    expect(roleHome("admin")).toBe("/dashboard");
  });
});
