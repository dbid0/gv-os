import "server-only";

import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clientTrackingRows, paymentEmailAliases } from "@/db/schema/app";
import { buildAliasMap } from "@/lib/tracking/aliases";
import { phoneKey, validateMerge, type MergeCandidate } from "@/lib/tracking/identity";

type Result = { ok: true } | { ok: false; reason: string };

/**
 * Merge an inbox into a person. The one-hop rules are checked against the
 * offer's CURRENT alias map inside a transaction, so two merges racing each
 * other can't build a chain between them; the unique index backs it up.
 */
export async function mergeInbox(input: {
  clientId: string;
  alias: string;
  canonical: string;
  createdBy: string | null;
}): Promise<Result> {
  const db = getDb();
  return db.transaction(async (tx) => {
    // Serialise merges per offer for the length of this transaction.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.clientId}))`);
    const rows = await tx
      .select({
        aliasEmail: paymentEmailAliases.aliasEmail,
        canonicalEmail: paymentEmailAliases.canonicalEmail,
      })
      .from(paymentEmailAliases)
      .where(eq(paymentEmailAliases.clientId, input.clientId));
    const verdict = validateMerge({
      alias: input.alias,
      canonical: input.canonical,
      aliases: buildAliasMap(rows),
    });
    if (!verdict.ok) return verdict;
    await tx.insert(paymentEmailAliases).values({
      clientId: input.clientId,
      aliasEmail: verdict.alias,
      canonicalEmail: verdict.canonical,
      createdBy: input.createdBy,
    });
    return { ok: true };
  });
}

/** Unmerge one inbox. Nothing else about the person changes. */
export async function unmergeInbox(clientId: string, alias: string): Promise<Result> {
  const db = getDb();
  const removed = await db
    .delete(paymentEmailAliases)
    .where(
      and(
        eq(paymentEmailAliases.clientId, clientId),
        eq(paymentEmailAliases.aliasEmail, alias.trim().toLowerCase()),
      ),
    )
    .returning({ id: paymentEmailAliases.id });
  return removed.length > 0
    ? { ok: true }
    : { ok: false, reason: "That inbox isn't merged into anyone." };
}

/**
 * Other inboxes in the snapshot that share a phone number or full name with
 * this person's rows — raw candidates for the ranked suggestions.
 */
export async function mergeCandidatesFor(
  syncId: string,
  inboxes: string[],
): Promise<MergeCandidate[]> {
  const db = getDb();
  const mine = await db
    .select({ name: clientTrackingRows.name, phone: clientTrackingRows.phone })
    .from(clientTrackingRows)
    .where(
      and(
        eq(clientTrackingRows.syncId, syncId),
        inArray(clientTrackingRows.email, inboxes),
      ),
    );
  const names = new Set(
    mine
      .map((r) => r.name?.trim().toLowerCase())
      .filter((n): n is string => Boolean(n) && (n as string).includes(" ")),
  );
  const phones = new Set(
    mine.map((r) => phoneKey(r.phone)).filter((p): p is string => p !== null),
  );
  if (names.size === 0 && phones.size === 0) return [];

  const others = await db
    .select({
      email: clientTrackingRows.email,
      name: clientTrackingRows.name,
      phone: clientTrackingRows.phone,
    })
    .from(clientTrackingRows)
    .where(
      and(
        eq(clientTrackingRows.syncId, syncId),
        isNotNull(clientTrackingRows.email),
        ne(clientTrackingRows.email, inboxes[0]),
      ),
    )
    .limit(5000);

  return others
    .filter((r) => r.email)
    .map((r) => ({
      email: r.email as string,
      sharedName: names.has(r.name?.trim().toLowerCase() ?? ""),
      sharedPhone: (() => {
        const key = phoneKey(r.phone);
        return key !== null && phones.has(key);
      })(),
    }))
    .filter((c) => c.sharedName || c.sharedPhone);
}
