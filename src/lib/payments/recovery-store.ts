import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, paymentEvents } from "@/db/schema/app";
import {
  classifyRecovery,
  effectiveRecoveryStatus,
  isRecoveryDisposition,
  isUnrecovered,
  type EffectiveRecoveryStatus,
  type RecoveryClass,
  type RecoveryDisposition,
  type SucceededCharge,
} from "@/lib/payments/recovery";

/**
 * The recovery inbox read layer. Failed attempts are captured in
 * `payment_events` with kind "failed"; success is captured with kind "charge".
 * Here we pull both, classify each failure against the successes on the SAME
 * connection, fold in the admin disposition, and hand the page a ready row.
 *
 * Money note: nothing in here posts, sums into a ledger, or feeds a revenue
 * figure. `amountCents` on a returned row is attempted-and-declined money —
 * recoverable, never collected.
 */

export interface RecoveryRow {
  id: string;
  provider: string;
  clientId: string | null;
  clientName: string | null;
  email: string | null;
  /** Attempted-and-declined cents. NOT revenue, NOT cash. */
  amountCents: number;
  failureCode: string | null;
  failureMessage: string | null;
  occurredAt: Date | null;
  createdAt: Date;
  disposition: RecoveryDisposition | null;
  recoveryClass: RecoveryClass;
  effectiveStatus: EffectiveRecoveryStatus;
}

/**
 * Every failed charge that has NOT been recovered, richest first. A failure is
 * matched to later successes only within its own connection (integration) — a
 * customer paying a different client is not a recovery of this one.
 */
export async function listRecoveryRows(): Promise<RecoveryRow[]> {
  const db = getDb();

  const [failedRows, succeededRows] = await Promise.all([
    db
      .select({
        id: paymentEvents.id,
        provider: paymentEvents.provider,
        integrationId: paymentEvents.integrationId,
        clientId: paymentEvents.clientId,
        clientName: clients.name,
        email: paymentEvents.email,
        customerRef: paymentEvents.customerRef,
        amountCents: paymentEvents.amountCents,
        failureCode: paymentEvents.failureCode,
        failureMessage: paymentEvents.failureMessage,
        occurredAt: paymentEvents.occurredAt,
        createdAt: paymentEvents.createdAt,
        recoveryStatus: paymentEvents.recoveryStatus,
      })
      .from(paymentEvents)
      .leftJoin(clients, eq(paymentEvents.clientId, clients.id))
      .where(eq(paymentEvents.kind, "failed")),
    db
      .select({
        integrationId: paymentEvents.integrationId,
        email: paymentEvents.email,
        customerRef: paymentEvents.customerRef,
        occurredAt: paymentEvents.occurredAt,
      })
      .from(paymentEvents)
      .where(and(eq(paymentEvents.kind, "charge"), ne(paymentEvents.amountCents, 0))),
  ]);

  // Group successes by connection so a match only ever considers the same book.
  const successByIntegration = new Map<string, SucceededCharge[]>();
  for (const s of succeededRows) {
    const list = successByIntegration.get(s.integrationId) ?? [];
    list.push({
      customerRef: s.customerRef,
      email: s.email,
      occurredAt: s.occurredAt,
    });
    successByIntegration.set(s.integrationId, list);
  }

  const rows: RecoveryRow[] = [];
  for (const f of failedRows) {
    const recoveryClass = classifyRecovery(
      { customerRef: f.customerRef, email: f.email, occurredAt: f.occurredAt },
      successByIntegration.get(f.integrationId) ?? [],
    );
    const disposition = isRecoveryDisposition(f.recoveryStatus)
      ? f.recoveryStatus
      : null;
    const effectiveStatus = effectiveRecoveryStatus(recoveryClass, disposition);
    // A recovered failure is off the chase list — the money came in.
    if (!isUnrecovered(effectiveStatus)) continue;
    rows.push({
      id: f.id,
      provider: f.provider,
      clientId: f.clientId,
      clientName: f.clientName,
      email: f.email,
      amountCents: f.amountCents,
      failureCode: f.failureCode,
      failureMessage: f.failureMessage,
      occurredAt: f.occurredAt,
      createdAt: f.createdAt,
      disposition,
      recoveryClass,
      effectiveStatus,
    });
  }

  // Richest first — the biggest recoverable dollars lead the inbox.
  rows.sort((a, b) => b.amountCents - a.amountCents);
  return rows;
}

/** How many failed charges the same customer later paid — context, not a total. */
export async function countAutoRecovered(): Promise<number> {
  const rows = await allFailedWithClass();
  return rows.filter((r) => r.recoveryClass === "recovered").length;
}

/** Internal: every failed charge with its derived class (no disposition fold). */
async function allFailedWithClass(): Promise<{ recoveryClass: RecoveryClass }[]> {
  const db = getDb();
  const [failedRows, succeededRows] = await Promise.all([
    db
      .select({
        integrationId: paymentEvents.integrationId,
        email: paymentEvents.email,
        customerRef: paymentEvents.customerRef,
        occurredAt: paymentEvents.occurredAt,
      })
      .from(paymentEvents)
      .where(eq(paymentEvents.kind, "failed")),
    db
      .select({
        integrationId: paymentEvents.integrationId,
        email: paymentEvents.email,
        customerRef: paymentEvents.customerRef,
        occurredAt: paymentEvents.occurredAt,
      })
      .from(paymentEvents)
      .where(and(eq(paymentEvents.kind, "charge"), ne(paymentEvents.amountCents, 0))),
  ]);
  const byIntegration = new Map<string, SucceededCharge[]>();
  for (const s of succeededRows) {
    const list = byIntegration.get(s.integrationId) ?? [];
    list.push({ customerRef: s.customerRef, email: s.email, occurredAt: s.occurredAt });
    byIntegration.set(s.integrationId, list);
  }
  return failedRows.map((f) => ({
    recoveryClass: classifyRecovery(
      { customerRef: f.customerRef, email: f.email, occurredAt: f.occurredAt },
      byIntegration.get(f.integrationId) ?? [],
    ),
  }));
}

/**
 * Set (or clear) the admin disposition on a declined charge. Only a "failed"
 * row can carry one — this can never touch a real charge or refund, and it
 * never moves a money total. `null` clears it back to open.
 */
export async function setRecoveryDisposition(
  paymentEventId: string,
  disposition: RecoveryDisposition | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getDb();
  const updated = await db
    .update(paymentEvents)
    .set({ recoveryStatus: disposition })
    .where(and(eq(paymentEvents.id, paymentEventId), eq(paymentEvents.kind, "failed")))
    .returning({ id: paymentEvents.id });
  if (updated.length === 0) {
    return { ok: false, reason: "Not a failed charge, or no longer present." };
  }
  return { ok: true };
}
