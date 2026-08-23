import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { userPrefs } from "@/db/schema/app";

/**
 * Per-user persisted UI prefs (v2 Phase 0). Identity = email (magic-link
 * auth); while the login wall is down the caller may not have one, so a
 * shared fallback identity keeps prefs working during the build phase.
 */

const FALLBACK_IDENTITY = "shared@build-phase";

export async function getPref<T>(
  userEmail: string | null | undefined,
  key: string,
): Promise<T | null> {
  const db = getDb();
  const [row] = await db
    .select({ value: userPrefs.value })
    .from(userPrefs)
    .where(
      and(
        eq(userPrefs.userEmail, userEmail ?? FALLBACK_IDENTITY),
        eq(userPrefs.key, key),
      ),
    )
    .limit(1);
  return (row?.value as T | undefined) ?? null;
}

export async function setPref(
  userEmail: string | null | undefined,
  key: string,
  value: unknown,
): Promise<void> {
  const db = getDb();
  await db
    .insert(userPrefs)
    .values({ userEmail: userEmail ?? FALLBACK_IDENTITY, key, value })
    .onConflictDoUpdate({
      target: [userPrefs.userEmail, userPrefs.key],
      set: { value, updatedAt: new Date() },
    });
}

/** Several prefs in one round trip — the shell reads these on every page. */
export async function getPrefs(
  userEmail: string | null | undefined,
  keys: string[],
): Promise<Record<string, unknown>> {
  const db = getDb();
  const rows = await db
    .select({ key: userPrefs.key, value: userPrefs.value })
    .from(userPrefs)
    .where(
      and(
        eq(userPrefs.userEmail, userEmail ?? FALLBACK_IDENTITY),
        inArray(userPrefs.key, keys),
      ),
    );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
