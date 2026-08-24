import { describe, expect, it } from "vitest";

import {
  isCoachViewer,
  managedClientIds,
  selectHomeIdentity,
  type HomeIdentity,
} from "@/lib/home/identity";
import type { TeamMemberRow } from "@/lib/team";

function member(over: Partial<TeamMemberRow>): TeamMemberRow {
  return {
    id: "m",
    name: "Member",
    role: "closer",
    roleKey: null,
    repKind: null,
    email: null,
    status: "active",
    clientId: null,
    clientName: null,
    repId: null,
    notes: null,
    ...over,
  };
}

const identity = (over: Partial<HomeIdentity>): HomeIdentity => ({
  platformRole: null,
  member: null,
  repId: null,
  managerClientId: null,
  ...over,
});

describe("selectHomeIdentity", () => {
  it("returns a null identity when there is no email", () => {
    expect(selectHomeIdentity([member({ email: "a@x.com" })], null)).toEqual({
      platformRole: null,
      member: null,
      repId: null,
      managerClientId: null,
    });
  });

  it("returns a null identity when no active row matches (owner / unmapped)", () => {
    const rows = [
      member({ email: "someone@x.com" }),
      member({ email: "daniel@gv.com", status: "inactive" }),
    ];
    expect(selectHomeIdentity(rows, "daniel@gv.com").platformRole).toBeNull();
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const row = member({
      email: "Rep@GV.com",
      roleKey: "sales_rep",
      repKind: "closer",
      repId: "rep-1",
    });
    const got = selectHomeIdentity([row], "  rep@gv.com ");
    expect(got.platformRole).toBe("sales_rep");
    expect(got.repId).toBe("rep-1");
  });

  it("resolves a lone manager row: role, scope lane, and no rep link", () => {
    const row = member({
      email: "mgr@gv.com",
      roleKey: "sales_manager",
      role: "manager",
      clientId: "client-grid",
    });
    const got = selectHomeIdentity([row], "mgr@gv.com");
    expect(got.platformRole).toBe("sales_manager");
    expect(got.managerClientId).toBe("client-grid");
    expect(got.repId).toBeNull();
    expect(got.member).toBe(row);
  });

  it("uses the rep row for the member and rep id when there is no manager row", () => {
    const rep = member({
      email: "rep@gv.com",
      roleKey: "sales_rep",
      repId: "rep-9",
      clientId: "client-vault",
    });
    const got = selectHomeIdentity([rep], "rep@gv.com");
    expect(got.member).toBe(rep);
    expect(got.repId).toBe("rep-9");
    expect(got.managerClientId).toBeNull();
  });

  it("widest role wins across rows; manager drives scope, rep row drives the link", () => {
    const managerRow = member({
      id: "m-mgr",
      email: "boss@gv.com",
      roleKey: "sales_manager",
      role: "manager",
      clientId: "client-grid",
    });
    const repRow = member({
      id: "m-rep",
      email: "boss@gv.com",
      roleKey: "sales_rep",
      repId: "rep-42",
      clientId: "client-grid",
    });
    // Order shouldn't matter: assert both orderings resolve identically.
    const got = selectHomeIdentity([repRow, managerRow], "boss@gv.com");
    expect(got.platformRole).toBe("sales_manager");
    expect(got.member).toBe(managerRow);
    expect(got.managerClientId).toBe("client-grid");
    expect(got.repId).toBe("rep-42");

    const reversed = selectHomeIdentity([managerRow, repRow], "boss@gv.com");
    expect(reversed.platformRole).toBe("sales_manager");
    expect(reversed.member).toBe(managerRow);
    expect(reversed.repId).toBe("rep-42");
  });

  it("falls back to the widest-role row when neither manager nor rep-linked", () => {
    const row = member({
      email: "va@gv.com",
      roleKey: "team_member",
      role: "va",
    });
    const got = selectHomeIdentity([row], "va@gv.com");
    expect(got.platformRole).toBe("team_member");
    expect(got.member).toBe(row);
    expect(got.repId).toBeNull();
  });

  it("reads a legacy operator row as admin", () => {
    const row = member({ email: "op@gv.com", role: "operator", roleKey: null });
    expect(selectHomeIdentity([row], "op@gv.com").platformRole).toBe("admin");
  });

  it("an agency-wide manager (no lane) resolves managerClientId to null", () => {
    const row = member({
      email: "mgr@gv.com",
      roleKey: "sales_manager",
      role: "manager",
      clientId: null,
    });
    expect(selectHomeIdentity([row], "mgr@gv.com").managerClientId).toBeNull();
  });
});

describe("isCoachViewer", () => {
  it("shows Coach for managers, admins, and unmapped owners", () => {
    expect(isCoachViewer(identity({ platformRole: "sales_manager" }))).toBe(true);
    expect(isCoachViewer(identity({ platformRole: "admin" }))).toBe(true);
    expect(isCoachViewer(identity({ platformRole: null }))).toBe(true);
    expect(isCoachViewer(identity({ platformRole: "team_member" }))).toBe(true);
  });

  it("shows Wingman only for a rep that is actually linked", () => {
    expect(isCoachViewer(identity({ platformRole: "sales_rep", repId: "rep-1" }))).toBe(
      false,
    );
    // A sales_rep with no rep link falls back to Coach rather than a blank board.
    expect(isCoachViewer(identity({ platformRole: "sales_rep", repId: null }))).toBe(
      true,
    );
  });
});

describe("managedClientIds", () => {
  const active = ["a", "b", "c"];

  it("gives every offer to admins and unmapped owners", () => {
    expect(managedClientIds(identity({ platformRole: null }), active)).toEqual(active);
    expect(managedClientIds(identity({ platformRole: "admin" }), active)).toEqual(
      active,
    );
  });

  it("gives every offer to an agency-wide manager and to reps", () => {
    expect(
      managedClientIds(
        identity({ platformRole: "sales_manager", managerClientId: null }),
        active,
      ),
    ).toEqual(active);
    expect(managedClientIds(identity({ platformRole: "sales_rep" }), active)).toEqual(
      active,
    );
  });

  it("scopes a lane-pinned manager to their single offer", () => {
    expect(
      managedClientIds(
        identity({ platformRole: "sales_manager", managerClientId: "b" }),
        active,
      ),
    ).toEqual(["b"]);
  });

  it("returns nothing when the manager's lane is not among the active offers", () => {
    expect(
      managedClientIds(
        identity({ platformRole: "sales_manager", managerClientId: "z" }),
        active,
      ),
    ).toEqual([]);
  });
});
