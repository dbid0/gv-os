/**
 * v2 role & scope model (spec §1/§6) — pure. Roles gate ROUTES here; data
 * scoping (which client's numbers a manager sees) lands with the two-view
 * architecture. Deny-by-default: a route not granted to a role redirects to
 * that role's home.
 */

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
  sales_manager: ["/dashboard", "/sales", "/profile"],
  sales_rep: ["/dashboard", "/sales", "/profile"],
  team_member: ["/dashboard", "/action-list", "/team", "/profile"],
  // Clients live in their workspace; WHICH /w/[slug] they may open narrows
  // to their own in Phase 6 when client identities exist.
  client: ["/dashboard", "/profile", "/w"],
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
