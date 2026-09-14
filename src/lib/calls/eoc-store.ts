import "server-only";

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { bookings, callEocReports, reps } from "@/db/schema/app";
import type { FiledReport } from "@/lib/calls/call-log";
import type { EocReport } from "@/lib/crm/confirmation-rates";
import { eocAsLeadRow, eocAsReport, type CleanEoc } from "@/lib/calls/eoc-form";
import type { LeadEventInput } from "@/lib/tracking/leads";

export type FileEocResult =
  | { ok: true; id: string; replayed: boolean }
  | { ok: false; reason: "booking_has_report" | "booking_not_found" };

/**
 * File a report. Idempotent on `submissionKey`: the same form submitted twice
 * returns the first report instead of filing a second. A booking can carry one
 * ACTIVE report; filing another is refused (void the old one first), which the
 * partial unique index enforces even against a race.
 */
export async function fileEoc(input: {
  clientId: string;
  bookingId: string | null;
  eoc: CleanEoc;
  callAt: Date;
  submissionKey: string;
  submittedBy: string | null;
}): Promise<FileEocResult> {
  const db = getDb();

  const [existing] = await db
    .select({ id: callEocReports.id })
    .from(callEocReports)
    .where(eq(callEocReports.submissionKey, input.submissionKey))
    .limit(1);
  if (existing) return { ok: true, id: existing.id, replayed: true };

  if (input.bookingId) {
    const [booking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(eq(bookings.id, input.bookingId), eq(bookings.clientId, input.clientId)),
      )
      .limit(1);
    if (!booking) return { ok: false, reason: "booking_not_found" };
    const [active] = await db
      .select({ id: callEocReports.id })
      .from(callEocReports)
      .where(
        and(
          eq(callEocReports.bookingId, input.bookingId),
          isNull(callEocReports.voidedAt),
        ),
      )
      .limit(1);
    if (active) return { ok: false, reason: "booking_has_report" };
  }

  try {
    const [row] = await db
      .insert(callEocReports)
      .values({
        clientId: input.clientId,
        bookingId: input.bookingId,
        ...input.eoc,
        callAt: input.callAt,
        submissionKey: input.submissionKey,
        submittedBy: input.submittedBy,
      })
      .returning({ id: callEocReports.id });
    return { ok: true, id: row.id, replayed: false };
  } catch (error) {
    // Lost a race: either the same submission landed first (replay) or another
    // report took the booking. Re-read to say which, never file twice.
    const [again] = await db
      .select({ id: callEocReports.id })
      .from(callEocReports)
      .where(eq(callEocReports.submissionKey, input.submissionKey))
      .limit(1);
    if (again) return { ok: true, id: again.id, replayed: true };
    if (input.bookingId) return { ok: false, reason: "booking_has_report" };
    throw error;
  }
}

/** Active reports in the shape every outcome reader speaks. */
export async function activeEocReports(clientId: string): Promise<EocReport[]> {
  return (await activeFiledReports(clientId)).map((r) => ({
    email: r.email,
    status: r.status,
    outcome: r.outcome,
    occurredAt: r.occurredAt,
  }));
}

/** Active reports with the booking each was filed against (null when unbooked). */
export async function activeFiledReports(clientId: string): Promise<FiledReport[]> {
  const db = getDb();
  const rows = await db
    .select({
      leadEmail: callEocReports.leadEmail,
      outcome: callEocReports.outcome,
      callAt: callEocReports.callAt,
      bookingId: callEocReports.bookingId,
    })
    .from(callEocReports)
    .where(and(eq(callEocReports.clientId, clientId), isNull(callEocReports.voidedAt)));
  return rows.map((r) => ({ ...eocAsReport(r), bookingId: r.bookingId }));
}

/** Active in-app reports as lead events, for the lead builder. */
export async function appEocLeadRows(clientId: string): Promise<LeadEventInput[]> {
  const db = getDb();
  const rows = await db
    .select({
      leadEmail: callEocReports.leadEmail,
      outcome: callEocReports.outcome,
      callAt: callEocReports.callAt,
      closerName: reps.name,
      cashCollectedCents: callEocReports.cashCollectedCents,
      contractValueCents: callEocReports.contractValueCents,
      recordingUrl: callEocReports.recordingUrl,
      notes: callEocReports.notes,
      closeType: callEocReports.closeType,
    })
    .from(callEocReports)
    .leftJoin(reps, eq(reps.id, callEocReports.closerRepId))
    .where(and(eq(callEocReports.clientId, clientId), isNull(callEocReports.voidedAt)))
    .orderBy(callEocReports.callAt);
  return rows.map(eocAsLeadRow);
}

export type EocListRow = {
  id: string;
  bookingId: string | null;
  leadEmail: string;
  paymentEmail: string | null;
  outcome: string;
  closeType: string | null;
  cashCollectedCents: number | null;
  contractValueCents: number | null;
  closerName: string | null;
  recordingUrl: string | null;
  notes: string | null;
  callAt: Date;
  submittedBy: string | null;
  voidedAt: Date | null;
  voidedBy: string | null;
};

/** Recent reports for the list — active ones, or the restore bin. */
export async function listEocReports(
  clientId: string,
  options: { voided: boolean; limit?: number },
): Promise<EocListRow[]> {
  const db = getDb();
  return db
    .select({
      id: callEocReports.id,
      bookingId: callEocReports.bookingId,
      leadEmail: callEocReports.leadEmail,
      paymentEmail: callEocReports.paymentEmail,
      outcome: callEocReports.outcome,
      closeType: callEocReports.closeType,
      cashCollectedCents: callEocReports.cashCollectedCents,
      contractValueCents: callEocReports.contractValueCents,
      closerName: reps.name,
      recordingUrl: callEocReports.recordingUrl,
      notes: callEocReports.notes,
      callAt: callEocReports.callAt,
      submittedBy: callEocReports.submittedBy,
      voidedAt: callEocReports.voidedAt,
      voidedBy: callEocReports.voidedBy,
    })
    .from(callEocReports)
    .leftJoin(reps, eq(reps.id, callEocReports.closerRepId))
    .where(
      and(
        eq(callEocReports.clientId, clientId),
        options.voided
          ? isNotNull(callEocReports.voidedAt)
          : isNull(callEocReports.voidedAt),
      ),
    )
    .orderBy(desc(callEocReports.callAt))
    .limit(options.limit ?? 20);
}

/** Move a report to the restore bin. Scoped by client. */
export async function voidEoc(
  clientId: string,
  id: string,
  voidedBy: string | null,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(callEocReports)
    .set({ voidedAt: new Date(), voidedBy })
    .where(
      and(
        eq(callEocReports.id, id),
        eq(callEocReports.clientId, clientId),
        isNull(callEocReports.voidedAt),
      ),
    )
    .returning({ id: callEocReports.id });
  return rows.length > 0;
}

export type RestoreResult =
  { ok: true } | { ok: false; reason: "not_found" | "booking_has_report" };

/**
 * Bring a report back. Refused when its booking has since been given another
 * active report — two outcomes for one call would count the call twice.
 */
export async function restoreEoc(clientId: string, id: string): Promise<RestoreResult> {
  const db = getDb();
  const [row] = await db
    .select({ bookingId: callEocReports.bookingId })
    .from(callEocReports)
    .where(
      and(
        eq(callEocReports.id, id),
        eq(callEocReports.clientId, clientId),
        isNotNull(callEocReports.voidedAt),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.bookingId) {
    const [active] = await db
      .select({ id: callEocReports.id })
      .from(callEocReports)
      .where(
        and(
          eq(callEocReports.bookingId, row.bookingId),
          isNull(callEocReports.voidedAt),
        ),
      )
      .limit(1);
    if (active) return { ok: false, reason: "booking_has_report" };
  }
  try {
    await db
      .update(callEocReports)
      .set({ voidedAt: null, voidedBy: null })
      .where(and(eq(callEocReports.id, id), eq(callEocReports.clientId, clientId)));
  } catch {
    // The partial unique index caught a report filed for the booking between
    // the check above and this write.
    return { ok: false, reason: "booking_has_report" };
  }
  return { ok: true };
}
