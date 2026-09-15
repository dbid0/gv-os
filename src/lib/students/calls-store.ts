import "server-only";

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { offerSettings, studentCalls } from "@/db/schema/app";
import type { CleanStudentCall } from "@/lib/students/calls";

/**
 * Log a call. Idempotent on the submission key: the same form sent twice logs
 * one call and hands back the first one's id.
 */
export async function logStudentCall(input: {
  clientId: string;
  call: CleanStudentCall;
  submissionKey: string;
  by: string | null;
}): Promise<{ id: string; replayed: boolean }> {
  const db = getDb();
  const [row] = await db
    .insert(studentCalls)
    .values({
      clientId: input.clientId,
      ...input.call,
      submissionKey: input.submissionKey,
      createdBy: input.by,
    })
    .onConflictDoNothing({ target: [studentCalls.submissionKey] })
    .returning({ id: studentCalls.id });
  if (row) return { id: row.id, replayed: false };
  const [existing] = await db
    .select({ id: studentCalls.id })
    .from(studentCalls)
    .where(eq(studentCalls.submissionKey, input.submissionKey))
    .limit(1);
  return { id: existing.id, replayed: true };
}

/** Every active call's student, for counting against the limit. */
export async function activeStudentCallEmails(
  clientId: string,
): Promise<{ studentEmail: string }[]> {
  return getDb()
    .select({ studentEmail: studentCalls.studentEmail })
    .from(studentCalls)
    .where(and(eq(studentCalls.clientId, clientId), isNull(studentCalls.voidedAt)));
}

export type StudentCallRow = {
  id: string;
  studentEmail: string;
  heldAt: Date;
  coach: string | null;
  notes: string | null;
  voidedAt: Date | null;
};

/** The most recent calls, active or voided, newest first. */
export async function listStudentCalls(
  clientId: string,
  options: { voided: boolean; limit?: number },
): Promise<StudentCallRow[]> {
  return getDb()
    .select({
      id: studentCalls.id,
      studentEmail: studentCalls.studentEmail,
      heldAt: studentCalls.heldAt,
      coach: studentCalls.coach,
      notes: studentCalls.notes,
      voidedAt: studentCalls.voidedAt,
    })
    .from(studentCalls)
    .where(
      and(
        eq(studentCalls.clientId, clientId),
        options.voided
          ? isNotNull(studentCalls.voidedAt)
          : isNull(studentCalls.voidedAt),
      ),
    )
    .orderBy(desc(studentCalls.heldAt), desc(studentCalls.createdAt))
    .limit(options.limit ?? 20);
}

/** Void a call (voided = true) or bring it back (false). Scoped by client. */
export async function setStudentCallVoided(
  clientId: string,
  id: string,
  voided: boolean,
  by: string | null,
): Promise<boolean> {
  const rows = await getDb()
    .update(studentCalls)
    .set(
      voided
        ? { voidedAt: new Date(), voidedBy: by }
        : { voidedAt: null, voidedBy: null },
    )
    .where(
      and(
        eq(studentCalls.id, id),
        eq(studentCalls.clientId, clientId),
        voided ? isNull(studentCalls.voidedAt) : isNotNull(studentCalls.voidedAt),
      ),
    )
    .returning({ id: studentCalls.id });
  return rows.length > 0;
}

/** The offer's 1-on-1 limit, or null when none is set. */
export async function callLimitFor(clientId: string): Promise<number | null> {
  const [row] = await getDb()
    .select({ limit: offerSettings.oneOnOneCallLimit })
    .from(offerSettings)
    .where(eq(offerSettings.clientId, clientId))
    .limit(1);
  return row?.limit ?? null;
}
