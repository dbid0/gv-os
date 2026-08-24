/**
 * v2 role & scope model (spec §1/§6) — pure. Roles gate ROUTES here; data
 * scoping (which client's numbers a manager sees) lands with the two-view
 * architecture. Deny-by-default: a route not granted to a role redirects to
 * that role's home.
 *
 * This file stays PURE (no server-only, no DB) so client components, the
 * middleware, and tests all share the exact same decisions. The DB lookup that
 * turns a signed-in email into a real role lives in `resolve-role.ts`.
 */

import { platformRoleOf, type MemberRoleShape } from "@/lib/team-roles";

export const ROLES = [
  "admin",
  "sales_manager",
  "sales_rep",
  "team_member",
  "client",
] as const;
export type Role = (typeof ROLES)[number];

/** Sales reps subdivide; the sub-kind never widens route access. */
export type RepKind = "setter" | "closer";

/**
 * Route prefixes each role may open. Checked by prefix on the pathname, most
 * specific rule irrelevant — any match grants. Admin is handled as all-access
 * in code, not listed here.
 */
const ROUTE_GRANTS: Record<Exclude<Role, "admin">, string[]> = {
  sales_manager: [
    "/home/manager",
    "/sales",
    "/assistant",
    "/notifications",
    "/profile",
    "/w",
  ],
  sales_rep: ["/home/member", "/sales", "/assistant", "/notifications", "/profile"],
  team_member: ["/home/member", "/team", "/notifications", "/profile", "/w"],
  // Clients live in ONE workspace — the middleware pins them to their slug;
  // these grants are the outer boundary.
  client: ["/profile", "/w"],
};

/** Where a denied navigation lands: every role's safe home. */
export const ROLE_HOME = "/dashboard";

export function canAccessRoute(role: Role, pathname: string): boolean {
  if (role === "admin") return true;
  const path = pathname.split("?")[0];
  return ROUTE_GRANTS[role].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Permissiveness order, least-restrictive first. Used to pick a winner when a
 * person somehow maps to more than one active team row: the WIDEST role wins,
 * so a data anomaly never wrongly restricts someone (the standing safe-default
 * rule — when in doubt, more access, never less).
 */
const ROLE_PERMISSIVENESS: Record<Role, number> = {
  admin: 0,
  sales_manager: 1,
  sales_rep: 2,
  team_member: 3,
  client: 4,
};

/**
 * The REAL role for a set of active team-roster rows matched to a signed-in
 * email. Pure so it is trivially testable.
 *
 * SAFE DEFAULT (non-negotiable): NO rows -> `admin`. Any allowlisted email not
 * mapped to a narrower active team member — owners (daniel@/gus@) and every
 * unmapped address included — is admin. When several rows match, the widest
 * role wins, so ambiguity never restricts.
 */
export function roleFromTeamRows(rows: MemberRoleShape[]): Role {
  if (rows.length === 0) return "admin";
  let best: Role = "client";
  for (const row of rows) {
    const role: Role = platformRoleOf(row);
    if (ROLE_PERMISSIVENESS[role] < ROLE_PERMISSIVENESS[best]) best = role;
  }
  return best;
}

/**
 * The role actually in force, after the restrict-only "View as" preview.
 *
 * Only an admin may wear another role, and even then the preview can only
 * NARROW what they see — it can never widen. A non-admin real role ignores the
 * preview cookie entirely, so a forged `gv-dev-role=admin` cookie on a narrower
 * account grants nothing.
 */
export function effectiveRole(realRole: Role, preview: Role | null): Role {
  return realRole === "admin" && preview ? preview : realRole;
}

/** Every role's safe landing page when it is bounced off a route it can't open. */
export function roleHome(role: Role): string {
  if (role === "sales_manager") return "/home/manager";
  if (role === "sales_rep" || role === "team_member") return "/home/member";
  return ROLE_HOME;
}

/**
 * The single route-guard decision, shared by the middleware and its tests:
 * where a role should be redirected for `pathname`, or null to let it through.
 *
 * Admin passes everything. A client is pinned to its ONE workspace (plus its
 * profile); everyone else is checked against `canAccessRoute`, and a denial
 * lands on the role's home. Returning null for the role's own home avoids a
 * redirect loop.
 */
export function guardTarget(
  role: Role,
  pathname: string,
  clientSlug?: string | null,
): string | null {
  if (role === "admin") return null;
  const path = pathname.split("?")[0];

  if (role === "client") {
    const home = clientSlug ? `/w/${clientSlug}` : ROLE_HOME;
    const allowed =
      (clientSlug &&
        (path === `/w/${clientSlug}` || path.startsWith(`/w/${clientSlug}/`))) ||
      path === "/profile" ||
      path.startsWith("/profile/");
    if (!allowed && path !== home) return home;
    return null;
  }

  if (!canAccessRoute(role, path)) return roleHome(role);
  return null;
}
