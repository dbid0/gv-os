/**
 * One-time backlog cleanup for the finance-drift notification dedupe bug.
 *
 * `spine_drift` (Money Spine reconciler) and `sheet_drift` (legacy sheet
 * mirror) alerts used to carry the drift AMOUNT (or, for sheet_drift, the
 * sync run's own id) inside `notifications.dedupe_key`. Both change every
 * evaluation cycle, so `onConflictDoNothing` on the unique dedupe-key index
 * never found a match and every cron pass minted a brand-new "critical" row
 * for the same drifting book/period — see rules.ts (spineDriftRule,
 * driftRule) for the fix to the key itself. This script does NOT touch that
 * logic; it only cleans up the duplicate rows the old key shape already
 * wrote before the fix shipped.
 *
 * For every (kind, stable key) group of existing rows:
 *   - one row is kept as the OPEN alert for that book/period (the one
 *     already on the new stable key, if the fixed code already inserted one;
 *     otherwise the most recently created of the old-format duplicates) —
 *     its dedupe_key is renamed to the new stable form so future evaluations
 *     conflict against it correctly;
 *   - every other row in the group is marked read (readAt = now), same
 *     mutation the "mark as read" button in the UI already performs. Nothing
 *     is deleted, and no title/body/severity is touched.
 *
 * Idempotent: run it twice and the second pass is a no-op (every group is
 * already singleton-stable). Never touches any table but `notifications`,
 * and only rows with kind IN (spine_drift, sheet_drift).
 *
 *   DATABASE_URL=… npx tsx scripts/collapse-drift-duplicates.ts [--dry]
 */
import { and, inArray, isNull, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import { notifications } from "@/db/schema/app";
import { dayKeyCT } from "@/lib/charts";

const dry = process.argv.includes("--dry");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const DRIFT_KINDS = ["spine_drift", "sheet_drift"] as const;

/**
 * The stable key a row SHOULD have under the fixed rules, derived from its
 * current (possibly old-format) dedupe_key plus its own createdAt — never
 * from the title/body, which carry the dollar figure and must stay out of
 * this entirely. Returns null for a shape neither rule ever produced (left
 * untouched rather than guessed at).
 */
function stableKeyFor(kind: string, dedupeKey: string, createdAt: Date): string | null {
  const parts = dedupeKey.split(":");
  if (kind === "spine_drift" && parts[0] === "spine-drift") {
    // New shape: spine-drift:<scope>:<month> (3 parts).
    // Old shape:  spine-drift:<scope>:<month>:<cashDeltaCents> (4 parts).
    if (parts.length === 3) return dedupeKey;
    if (parts.length === 4) return parts.slice(0, 3).join(":");
    return null;
  }
  if (kind === "sheet_drift" && parts[0] === "drift") {
    // New shape: drift:<YYYY-MM-DD> (day key, CT).
    // Old shape: drift:<sheetSyncRuns.id> (a uuid, one per cron run).
    const tail = parts.slice(1).join(":");
    if (/^\d{4}-\d{2}-\d{2}$/.test(tail)) return dedupeKey;
    if (parts.length === 2 && tail.length > 0) return `drift:${dayKeyCT(createdAt)}`;
    return null;
  }
  return null;
}

async function main() {
  const client = postgres(url!, { max: 4, prepare: false });
  const db = drizzle(client, { schema });

  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      dedupeKey: notifications.dedupeKey,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(inArray(notifications.kind, [...DRIFT_KINDS]));

  const groups = new Map<string, typeof rows>();
  let unrecognized = 0;
  for (const r of rows) {
    const stable = stableKeyFor(r.kind, r.dedupeKey, r.createdAt);
    if (!stable) {
      unrecognized++;
      continue;
    }
    const groupKey = `${r.kind}|${stable}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), r]);
  }

  let renamed = 0;
  let markedRead = 0;
  let alreadyClean = 0;

  for (const [groupKey, group] of groups) {
    const [, stable] = groupKey.split("|");
    // Prefer a row that already carries the stable key (the fixed code
    // already inserted a fresh one) over picking by recency, so a race with
    // a live cron never gets second-guessed.
    const already = group.find((r) => r.dedupeKey === stable);
    const keeper =
      already ??
      [...group].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const others = group.filter((r) => r.id !== keeper.id);

    if (keeper.dedupeKey !== stable) {
      if (dry) {
        console.log(`  [dry] rename ${keeper.id} -> "${stable}"`);
      } else {
        try {
          await db
            .update(notifications)
            .set({ dedupeKey: stable })
            .where(eq(notifications.id, keeper.id));
        } catch (e) {
          // A live cron beat us to inserting the stable key between our
          // SELECT and this UPDATE — leave this row as an extra duplicate
          // rather than crash the whole cleanup; it'll collapse next run.
          console.log(
            `  SKIP  rename ${keeper.id} — conflict (already applied elsewhere): ${
              e instanceof Error ? e.message : e
            }`,
          );
          continue;
        }
      }
      renamed++;
    } else {
      alreadyClean++;
    }

    const toResolve = others.filter((r) => r.readAt === null).map((r) => r.id);
    if (toResolve.length > 0) {
      if (dry) {
        console.log(`  [dry] mark read: ${toResolve.length} duplicate row(s)`);
      } else {
        await db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(inArray(notifications.id, toResolve), isNull(notifications.readAt)),
          );
      }
      markedRead += toResolve.length;
    }
  }

  console.log(
    `${dry ? "[dry] " : ""}groups: ${groups.size} · renamed: ${renamed} · already stable: ${alreadyClean} · duplicates marked read: ${markedRead} · unrecognized key shape (skipped): ${unrecognized}`,
  );

  await client.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
