import { describe, expect, it } from "vitest";

import {
  MEMBER_SUBTYPES,
  MEMBER_SUBTYPE_VALUES,
  PLATFORM_ROLES,
  PLATFORM_ROLE_VALUES,
  REP_KINDS,
  REP_KIND_VALUES,
  TEAM_ROLES,
  TEAM_ROLE_VALUES,
  assigneeDisplay,
  isPlatformRole,
  isSalesRole,
  memberRoleColumns,
  memberRoleLabel,
  memberSubtypeLabel,
  platformRoleLabel,
  platformRoleOf,
  repKindLabel,
  roleLabel,
  roleRank,
} from "@/lib/team-roles";

describe("team roles", () => {
  it("covers every role Daniel named for the team OS", () => {
    for (const role of [
      "copywriter",
      "va",
      "creative_director",
      "setter",
      "closer",
      "manager",
      "operator",
    ]) {
      expect(TEAM_ROLE_VALUES).toContain(role);
    }
  });

  it("has no duplicate role values", () => {
    expect(new Set(TEAM_ROLE_VALUES).size).toBe(TEAM_ROLES.length);
  });

  it("labels known roles and falls back to the raw value for old data", () => {
    expect(roleLabel("creative_director")).toBe("Creative director");
    expect(roleLabel("va")).toBe("VA");
    expect(roleLabel("astronaut")).toBe("astronaut");
  });

  it("ranks roles in display order and sinks unknown roles to the end", () => {
    expect(roleRank("operator")).toBe(0);
    expect(roleRank("closer")).toBeLessThan(roleRank("astronaut"));
    expect(roleRank("astronaut")).toBe(TEAM_ROLES.length);
  });
});

describe("assigneeDisplay", () => {
  it("prefers the roster member's name over legacy text", () => {
    expect(assigneeDisplay("Aymen", "someone else")).toBe("Aymen");
  });

  it("falls back to the legacy free-text name from pre-Team rows", () => {
    expect(assigneeDisplay(null, "Gus")).toBe("Gus");
  });

  it("treats blank legacy text as unassigned", () => {
    expect(assigneeDisplay(null, "   ")).toBeNull();
    expect(assigneeDisplay(null, null)).toBeNull();
  });
});

describe("platform roles", () => {
  it("has the four roles Daniel named, with no duplicates", () => {
    expect(PLATFORM_ROLE_VALUES).toEqual([
      "admin",
      "sales_manager",
      "sales_rep",
      "team_member",
    ]);
    expect(new Set(PLATFORM_ROLE_VALUES).size).toBe(PLATFORM_ROLES.length);
  });

  it("labels platform roles and falls back to the raw value", () => {
    expect(platformRoleLabel("sales_manager")).toBe("Sales Manager");
    expect(platformRoleLabel("team_member")).toBe("Team Member");
    expect(platformRoleLabel("astronaut")).toBe("astronaut");
  });

  it("recognises valid platform roles", () => {
    expect(isPlatformRole("admin")).toBe(true);
    expect(isPlatformRole("closer")).toBe(false);
  });

  it("exposes rep-kind and member sub-type vocabularies", () => {
    expect(REP_KIND_VALUES).toEqual(["setter", "closer", "dm_setter"]);
    expect(new Set(REP_KIND_VALUES).size).toBe(REP_KINDS.length);
    expect(repKindLabel("dm_setter")).toBe("DM setter");
    expect(repKindLabel("mystery")).toBe("mystery");

    expect(MEMBER_SUBTYPE_VALUES).toEqual(["copywriter", "va", "creative_director"]);
    expect(new Set(MEMBER_SUBTYPE_VALUES).size).toBe(MEMBER_SUBTYPES.length);
  });
});

describe("platformRoleOf", () => {
  it("uses the stored role_key when it is a valid platform role", () => {
    expect(platformRoleOf({ role: "closer", roleKey: "admin", repKind: null })).toBe(
      "admin",
    );
    expect(platformRoleOf({ role: "x", roleKey: "sales_rep", repKind: "closer" })).toBe(
      "sales_rep",
    );
  });

  it("infers a legacy row's platform role from its job title", () => {
    expect(platformRoleOf({ role: "manager", roleKey: null, repKind: null })).toBe(
      "sales_manager",
    );
    expect(platformRoleOf({ role: "setter", roleKey: null, repKind: null })).toBe(
      "sales_rep",
    );
    expect(platformRoleOf({ role: "closer", roleKey: null, repKind: null })).toBe(
      "sales_rep",
    );
    expect(platformRoleOf({ role: "dm_setter", roleKey: null, repKind: null })).toBe(
      "sales_rep",
    );
    expect(platformRoleOf({ role: "operator", roleKey: null, repKind: null })).toBe(
      "admin",
    );
    expect(platformRoleOf({ role: "copywriter", roleKey: null, repKind: null })).toBe(
      "team_member",
    );
  });

  it("ignores an unknown role_key and falls back to the job title", () => {
    expect(platformRoleOf({ role: "va", roleKey: "bogus", repKind: null })).toBe(
      "team_member",
    );
  });
});

describe("memberSubtypeLabel", () => {
  it("shows the rep kind for a sales rep, preferring rep_kind over the title", () => {
    expect(
      memberSubtypeLabel({
        role: "closer",
        roleKey: "sales_rep",
        repKind: "dm_setter",
      }),
    ).toBe("DM setter");
    // Legacy rep row with no rep_kind falls back to the job title.
    expect(
      memberSubtypeLabel({ role: "setter", roleKey: "sales_rep", repKind: null }),
    ).toBe("Setter");
  });

  it("shows the job title for a team member", () => {
    expect(
      memberSubtypeLabel({ role: "copywriter", roleKey: "team_member", repKind: null }),
    ).toBe("Copywriter");
  });

  it("has no sub-type for admin or sales manager", () => {
    expect(
      memberSubtypeLabel({ role: "operator", roleKey: "admin", repKind: null }),
    ).toBeNull();
    expect(
      memberSubtypeLabel({ role: "manager", roleKey: "sales_manager", repKind: null }),
    ).toBeNull();
  });
});

describe("memberRoleLabel", () => {
  it("composes platform role and sub-type", () => {
    expect(
      memberRoleLabel({ role: "closer", roleKey: "sales_rep", repKind: "closer" }),
    ).toBe("Sales Rep · Closer");
    expect(memberRoleLabel({ role: "va", roleKey: "team_member", repKind: null })).toBe(
      "Team Member · VA",
    );
  });

  it("shows a bare label where there is no sub-type", () => {
    expect(memberRoleLabel({ role: "operator", roleKey: "admin", repKind: null })).toBe(
      "Admin",
    );
    expect(
      memberRoleLabel({ role: "manager", roleKey: "sales_manager", repKind: null }),
    ).toBe("Sales Manager");
  });
});

describe("isSalesRole", () => {
  it("is true for reps and managers, false for team members and admins", () => {
    expect(
      isSalesRole({ role: "closer", roleKey: "sales_rep", repKind: "closer" }),
    ).toBe(true);
    expect(
      isSalesRole({ role: "manager", roleKey: "sales_manager", repKind: null }),
    ).toBe(true);
    expect(
      isSalesRole({ role: "copywriter", roleKey: "team_member", repKind: null }),
    ).toBe(false);
    expect(isSalesRole({ role: "operator", roleKey: "admin", repKind: null })).toBe(
      false,
    );
  });
});

describe("memberRoleColumns", () => {
  it("maps a sales rep with an explicit kind", () => {
    expect(
      memberRoleColumns({ platformRole: "sales_rep", repKind: "dm_setter" }),
    ).toEqual({ role: "dm_setter", roleKey: "sales_rep", repKind: "dm_setter" });
  });

  it("defaults a sales rep with no kind to closer", () => {
    expect(memberRoleColumns({ platformRole: "sales_rep" })).toEqual({
      role: "closer",
      roleKey: "sales_rep",
      repKind: "closer",
    });
  });

  it("maps a sales manager to the manager job title, no kind", () => {
    expect(memberRoleColumns({ platformRole: "sales_manager" })).toEqual({
      role: "manager",
      roleKey: "sales_manager",
      repKind: null,
    });
  });

  it("maps a team member with an explicit sub-type", () => {
    expect(memberRoleColumns({ platformRole: "team_member", subtype: "va" })).toEqual({
      role: "va",
      roleKey: "team_member",
      repKind: null,
    });
  });

  it("defaults a team member with no sub-type to copywriter", () => {
    expect(memberRoleColumns({ platformRole: "team_member" })).toEqual({
      role: "copywriter",
      roleKey: "team_member",
      repKind: null,
    });
  });

  it("maps an admin to the operator job title, no kind", () => {
    expect(memberRoleColumns({ platformRole: "admin" })).toEqual({
      role: "operator",
      roleKey: "admin",
      repKind: null,
    });
  });
});

describe("dm_setter is a known job title", () => {
  it("labels and ranks it like the other roles", () => {
    expect(roleLabel("dm_setter")).toBe("DM setter");
    expect(roleRank("dm_setter")).toBeLessThan(TEAM_ROLES.length);
  });
});
