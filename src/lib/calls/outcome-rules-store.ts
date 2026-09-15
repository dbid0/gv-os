import "server-only";

import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  callEocReports,
  callOutcomeRules,
  leadTags,
  notifications,
} from "@/db/schema/app";
import {
  effectsFor,
  outcomeNotification,
  type CleanOutcomeRule,
  type OutcomeRule,
} from "@/lib/calls/outcome-rules";

export async function listOutcomeRules(clientId: string): Promise<OutcomeRule[]> {
  const rows = await getDb()
    .select({
      id: callOutcomeRules.id,
      outcome: callOutcomeRules.outcome,
      tag: callOutcomeRules.tag,
      notify: callOutcomeRules.notify,
    })
    .from(callOutcomeRules)
    .where(eq(callOutcomeRules.clientId, clientId))
    .orderBy(asc(callOutcomeRules.createdAt));
  return rows as OutcomeRule[];
}

/** Add a rule; the same outcome + tag twice is refused by the unique index. */
export async function createOutcomeRule(
  clientId: string,
  rule: CleanOutcomeRule,
  by: string | null,
): Promise<{ ok: true } | { ok: false; reason: "duplicate" }> {
  const rows = await getDb()
    .insert(callOutcomeRules)
    .values({ clientId, ...rule, createdBy: by })
    .onConflictDoNothing()
    .returning({ id: callOutcomeRules.id });
  return rows.length > 0 ? { ok: true } : { ok: false, reason: "duplicate" };
}

/** Delete a rule. Tags it already added stay: they record what happened. */
export async function deleteOutcomeRule(
  clientId: string,
  id: string,
): Promise<boolean> {
  const rows = await getDb()
    .delete(callOutcomeRules)
    .where(and(eq(callOutcomeRules.clientId, clientId), eq(callOutcomeRules.id, id)))
    .returning({ id: callOutcomeRules.id });
  return rows.length > 0;
}

/**
 * Run the offer's rules for one ACTIVE filed report: add its tags (marked as
 * this report's) and its notification, together. Re-running is harmless — a
 * tag already on the lead and a notification already sent are both skipped.
 * A voided or unknown report does nothing.
 */
export async function applyOutcomeRules(
  clientId: string,
  reportId: string,
): Promise<{ tags: string[]; notified: boolean }> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select({ outcome: callEocReports.outcome, leadEmail: callEocReports.leadEmail })
      .from(callEocReports)
      .where(
        and(
          eq(callEocReports.id, reportId),
          eq(callEocReports.clientId, clientId),
          isNull(callEocReports.voidedAt),
        ),
      )
      .limit(1);
    if (!report) return { tags: [], notified: false };

    const rules = await tx
      .select({
        outcome: callOutcomeRules.outcome,
        tag: callOutcomeRules.tag,
        notify: callOutcomeRules.notify,
      })
      .from(callOutcomeRules)
      .where(eq(callOutcomeRules.clientId, clientId));
    const effects = effectsFor(rules as CleanOutcomeRule[], report.outcome);
    const leadEmail = report.leadEmail.trim().toLowerCase();

    if (effects.tags.length > 0) {
      await tx
        .insert(leadTags)
        .values(
          effects.tags.map((tag) => ({
            clientId,
            leadEmail,
            tag,
            sourceEocReportId: reportId,
            createdBy: "outcome rule",
          })),
        )
        .onConflictDoNothing({
          target: [leadTags.clientId, leadTags.leadEmail, leadTags.tag],
        });
    }
    let notified = false;
    if (effects.notify) {
      const inserted = await tx
        .insert(notifications)
        .values(
          outcomeNotification({
            id: reportId,
            clientId,
            outcome: report.outcome,
            leadEmail,
            tags: effects.tags,
          }),
        )
        .onConflictDoNothing({ target: [notifications.dedupeKey] })
        .returning({ id: notifications.id });
      notified = inserted.length > 0;
    }
    return { tags: effects.tags, notified };
  });
}

/**
 * Take back the tags a voided report's rules added. A tag the lead's OTHER
 * active reports also call for goes straight back on under one of them — two
 * no-shows tagged "rebook", one voided, still leave a no-show to rebook.
 */
export async function unapplyOutcomeRules(
  clientId: string,
  reportId: string,
): Promise<number> {
  const db = getDb();
  const [report] = await db
    .select({ leadEmail: callEocReports.leadEmail })
    .from(callEocReports)
    .where(and(eq(callEocReports.id, reportId), eq(callEocReports.clientId, clientId)))
    .limit(1);
  if (!report) return 0;

  const removed = await db
    .delete(leadTags)
    .where(
      and(eq(leadTags.clientId, clientId), eq(leadTags.sourceEocReportId, reportId)),
    )
    .returning({ tag: leadTags.tag });
  if (removed.length === 0) return 0;

  const others = await db
    .select({ id: callEocReports.id })
    .from(callEocReports)
    .where(
      and(
        eq(callEocReports.clientId, clientId),
        ne(callEocReports.id, reportId),
        isNull(callEocReports.voidedAt),
        sql`lower(trim(${callEocReports.leadEmail})) = ${report.leadEmail.trim().toLowerCase()}`,
      ),
    )
    .orderBy(asc(callEocReports.createdAt));
  const restored = new Set<string>();
  for (const other of others) {
    for (const tag of (await applyOutcomeRules(clientId, other.id)).tags) {
      restored.add(tag);
    }
  }
  return removed.filter((r) => !restored.has(r.tag)).length;
}
