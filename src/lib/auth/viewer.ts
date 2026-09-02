import "server-only";

import { cookies } from "next/headers";

import { currentUser } from "@/lib/auth/server";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { effectiveRole, type Role } from "@/lib/auth/roles";

/**
 * The role the CURRENT viewer is browsing as — their real role from the Team
 * roster, narrowed by the `gv-dev-role` preview cookie.
 *
 * This is the same pair the middleware guard uses, in the same order, so a
 * surface can never show a control the guard would then bounce them off. It is
 * read here rather than re-derived per page so "admin-only" means one thing
 * everywhere.
 *
 * Fails OPEN to admin: role lookup is a convenience for hiding chrome, never
 * the security boundary (the guard and the server actions are), and a database
 * blip must not strip the owner's own navigation.
 */
export async function viewerRole(): Promise<Role> {
  try {
    const [user, cookieStore] = await Promise.all([currentUser(), cookies()]);
    const real = await resolveRealRole(user?.email ?? null);
    const preview = cookieStore.get("gv-dev-role")?.value ?? null;
    return effectiveRole(real, (preview as Role) || null);
  } catch {
    return "admin";
  }
}

/** Whether the viewer is browsing as an admin (owner view). */
export async function viewerIsAdmin(): Promise<boolean> {
  return (await viewerRole()) === "admin";
}
