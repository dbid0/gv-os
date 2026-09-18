import "server-only";

import { getDb } from "@/db/client";
import { notifications } from "@/db/schema/app";
import type { Candidate } from "@/lib/notifications/rules";

/**
 * File a run's alert candidates, and report which ones are NEW.
 *
 * Every rule re-derives its candidates on every evaluation, so the same alert
 * is offered again and again until the condition clears. The dedupe key is
 * what makes that safe: a key already in the table is the same alert, already
 * filed, and must not be filed or delivered twice.
 *
 * WHICH ONES LANDED IS THE POINT. Only newly-fired alerts are delivered to
 * Discord, so this has to distinguish "filed just now" from "was already
 * there" exactly. Postgres does that for us — an ON CONFLICT DO NOTHING
 * insert returns only the rows it actually took — which is more trustworthy
 * than reading the table first and racing another run between the read and
 * the write.
 *
 * ONE STATEMENT. This used to be a round-trip per candidate inside a loop:
 * on the live account roughly 38 sequential inserts every half hour, nearly
 * all of them no-ops against an existing key.
 */
export async function fileNewNotifications(
  candidates: Candidate[],
): Promise<Candidate[]> {
  // Two rules producing one key in a single run is a rule bug rather than
  // something to paper over, but sending the same key twice inside one
  // statement is a needless way to discover it.
  //
  // The FIRST wins, deliberately. Candidates arrive in rule order, which is
  // roughly severity order, so the earlier rule owns the alert. Building a
  // Map straight from the pairs would silently keep the LAST one — the same
  // shape, the opposite answer.
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    if (seen.has(c.dedupeKey)) return false;
    seen.add(c.dedupeKey);
    return true;
  });
  if (unique.length === 0) return [];

  const inserted = await getDb()
    .insert(notifications)
    .values(unique)
    .onConflictDoNothing({ target: [notifications.dedupeKey] })
    .returning({ dedupeKey: notifications.dedupeKey });

  const landed = new Set(inserted.map((r) => r.dedupeKey));
  // Returned in the caller's order, not the database's: the Discord batch
  // reads in rule order, which is roughly severity order.
  return unique.filter((c) => landed.has(c.dedupeKey));
}
