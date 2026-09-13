import { describe, expect, it, vi } from "vitest";

import { isAllowed, isAllowedWith } from "@/lib/auth/allowlist";
import { guardTarget, roleFromTeamRows } from "@/lib/auth/roles";
import type { MemberRoleShape } from "@/lib/team-roles";

/**
 * The DB-aware login gate: adding an ACTIVE team member grants login, owners
 * are always in with no DB call, and any failure reaching the roster denies the
 * non-owner without ever locking out an owner. `isAllowedWith` is the pure core
 * the live `isAllowedAsync` wires the cached DB read into, so proving it here
 * proves the gate without a database.
 */

const OWNER = "daniel@globalventures.app";
const activeSet =
  (...emails: string[]) =>
  async () =>
    new Set(emails);
const dbDown = async () => {
  throw new Error("database unreachable");
};

describe("isAllowedWith — the DB-aware login gate", () => {
  it("admits an ACTIVE team member by email, case-insensitively", async () => {
    expect(await isAllowedWith("rep@acme.com", "", activeSet("rep@acme.com"))).toBe(
      true,
    );
    expect(await isAllowedWith("  Rep@Acme.com ", "", activeSet("rep@acme.com"))).toBe(
      true,
    );
  });

  it("denies an email that is not in the active-member set", async () => {
    // Unknown address.
    expect(await isAllowedWith("ghost@acme.com", "", activeSet("rep@acme.com"))).toBe(
      false,
    );
    // An INACTIVE member is simply absent from the active set — access revoked.
    expect(await isAllowedWith("old@acme.com", "", activeSet("rep@acme.com"))).toBe(
      false,
    );
    // Empty roster: no non-owner gets in.
    expect(await isAllowedWith("rep@acme.com", "", activeSet())).toBe(false);
  });

  it("OWNERS always pass and NEVER touch the DB — even when it is down", async () => {
    const loader = vi.fn(dbDown);
    expect(await isAllowedWith(OWNER, "", loader)).toBe(true);
    expect(await isAllowedWith("gus@globalventures.app", "", loader)).toBe(true);
    // Short-circuited before the loader ran: the DB was never consulted.
    expect(loader).not.toHaveBeenCalled();
  });

  it("fail-safe: a DB error DENIES a non-owner but never throws", async () => {
    await expect(isAllowedWith("rep@acme.com", "", dbDown)).resolves.toBe(false);
    // A null/undefined result is treated the same way — deny by default.
    await expect(isAllowedWith("rep@acme.com", "", async () => null)).resolves.toBe(
      false,
    );
    await expect(
      isAllowedWith("rep@acme.com", "", async () => undefined),
    ).resolves.toBe(false);
  });

  it("honours a reconfigured owner list, still without a DB call", async () => {
    const loader = vi.fn(activeSet());
    expect(
      await isAllowedWith("a@globalventures.app", "a@globalventures.app", loader),
    ).toBe(true);
    expect(loader).not.toHaveBeenCalled();
  });

  it("rejects empty, null, and undefined addresses", async () => {
    expect(await isAllowedWith(null, "", activeSet("x@y.com"))).toBe(false);
    expect(await isAllowedWith(undefined, "", activeSet("x@y.com"))).toBe(false);
    expect(await isAllowedWith("   ", "", activeSet("x@y.com"))).toBe(false);
  });
});

const closer: MemberRoleShape = {
  role: "closer",
  roleKey: "sales_rep",
  repKind: "closer",
};
const manager: MemberRoleShape = {
  role: "manager",
  roleKey: "sales_manager",
  repKind: null,
};
const operator: MemberRoleShape = {
  role: "operator",
  roleKey: "admin",
  repKind: null,
};

describe("an invited sales_rep is rep-scoped, NOT admin", () => {
  it("resolves to sales_rep, never admin", () => {
    expect(roleFromTeamRows([closer])).toBe("sales_rep");
    expect(roleFromTeamRows([closer])).not.toBe("admin");
  });

  it("reaches their own sales board but is bounced off the books, team, and settings", () => {
    // Their own surfaces stay open.
    expect(guardTarget("sales_rep", "/sales")).toBeNull();
    expect(guardTarget("sales_rep", "/home/member")).toBeNull();
    // The agency books, the roster (where invites live), and settings are not.
    for (const locked of ["/accounting", "/accounting/payouts", "/settings", "/team"]) {
      expect(guardTarget("sales_rep", locked)).not.toBeNull();
    }
  });
});

describe("invite is admin-gated (the requireAdmin decision)", () => {
  // requireAdmin passes iff the caller is an owner (env allowlist) OR their
  // resolved platform role is admin; every narrower role is refused. These are
  // the exact pure pieces the server-action gate is composed from.
  it("passes an owner and a DB-invited admin", () => {
    expect(isAllowed(OWNER, "")).toBe(true); // owner via env
    expect(roleFromTeamRows([operator])).toBe("admin"); // DB-invited admin
  });

  it("refuses a sales_rep and a sales_manager (neither resolves to admin)", () => {
    expect(roleFromTeamRows([closer])).not.toBe("admin");
    expect(roleFromTeamRows([manager])).not.toBe("admin");
    expect(isAllowed("rep@acme.com", "")).toBe(false); // not an owner either
  });
});
