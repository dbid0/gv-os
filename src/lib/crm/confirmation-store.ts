import "server-only";

import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { callConfirmations } from "@/db/schema";

/**
 * Record (or amend) the confirmation for one booking. One row per booking —
 * a second confirm updates the existing row rather than stacking rows, so
 * "ever confirmed" stays a single lookup. Empty strings are stored as null:
 * a blank form field is an unknown, not a value.
 */
export async function upsertConfirmation(input: {
  bookingId: string;
  clientId: string | null;
  confirmedAt: Date;
  confirmedBy?: string | null;
  confirmedRole?: "setter" | "dialer" | "dm_setter" | null;
  correctedEmail?: string | null;
  correctedPhone?: string | null;
  preCallNotes?: string | null;
}): Promise<void> {
  const clean = (v: string | null | undefined) => {
    const t = v?.trim();
    return t ? t : null;
  };
  const db = getDb();
  await db
    .insert(callConfirmations)
    .values({
      bookingId: input.bookingId,
      clientId: input.clientId,
      confirmedAt: input.confirmedAt,
      confirmedBy: clean(input.confirmedBy),
      confirmedRole: clean(input.confirmedRole),
      correctedEmail: clean(input.correctedEmail),
      correctedPhone: clean(input.correctedPhone),
      preCallNotes: clean(input.preCallNotes),
    })
    .onConflictDoUpdate({
      target: callConfirmations.bookingId,
      set: {
        confirmedAt: input.confirmedAt,
        confirmedBy: clean(input.confirmedBy),
        confirmedRole: clean(input.confirmedRole),
        correctedEmail: clean(input.correctedEmail),
        correctedPhone: clean(input.correctedPhone),
        preCallNotes: clean(input.preCallNotes),
        updatedAt: sql`now()`,
      },
    });
}

/** All confirmations for one client, for joining against bookings. */
export async function listConfirmations(clientId: string) {
  const db = getDb();
  return db
    .select({
      bookingId: callConfirmations.bookingId,
      confirmedAt: callConfirmations.confirmedAt,
      confirmedBy: callConfirmations.confirmedBy,
      confirmedRole: callConfirmations.confirmedRole,
    })
    .from(callConfirmations)
    .where(eq(callConfirmations.clientId, clientId));
}
