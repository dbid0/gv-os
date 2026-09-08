import "server-only";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, offerSettings } from "@/db/schema/app";

/**
 * What a CLIENT may see in their portal — the per-offer visibility toggles
 * (v2 §6: apps and assets on by default, MONEY OFF until the admin turns it
 * on). One shared reader, because the rule broke the moment a second page
 * needed it: the workspace home gated cash and the sales tab showed it
 * unconditionally.
 */
export async function portalVisibility(slug: string): Promise<Record<string, boolean>> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ visibility: offerSettings.visibility })
      .from(offerSettings)
      .innerJoin(clients, eq(offerSettings.clientId, clients.id))
      .where(eq(clients.slug, slug))
      .limit(1);
    return row?.visibility ?? {};
  } catch {
    return {};
  }
}

/** True when the viewer is browsing as the CLIENT (portal view). */
export async function isPortalView(): Promise<boolean> {
  const store = await cookies();
  return store.get("gv-dev-role")?.value === "client";
}

/** A portal-gated flag: admins see everything; clients get the toggle. */
export function portalShows(
  portalView: boolean,
  visibility: Record<string, boolean>,
  key: string,
  fallback: boolean,
): boolean {
  return !portalView || (visibility[key] ?? fallback);
}
