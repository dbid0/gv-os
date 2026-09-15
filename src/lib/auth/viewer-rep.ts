import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { profiles, reps } from "@/db/schema/app";
import { currentUser } from "@/lib/auth/server";

/**
 * The active rep the signed-in viewer IS on one offer — their sign-in profile
 * linked to a rep row — or null (not signed in, not a rep here, or the lookup
 * failed). A convenience for "my leads"-style shortcuts, never an access
 * check: what a viewer may see is decided by their role, not by this.
 */
export async function viewerRepFor(
  clientId: string,
): Promise<{ id: string; name: string } | null> {
  try {
    const user = await currentUser();
    if (!user?.email) return null;
    const [row] = await getDb()
      .select({ id: reps.id, name: reps.name })
      .from(reps)
      .innerJoin(profiles, eq(reps.profileId, profiles.id))
      .where(
        and(
          eq(reps.clientId, clientId),
          eq(reps.status, "active"),
          eq(profiles.email, user.email.trim().toLowerCase()),
        ),
      )
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}
