"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { activityLogs, reps } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import {
  ACTIVITY_MODE_KEYS,
  CALL_TYPE_KEYS,
  DISPOSITION_KEYS,
} from "@/lib/sales/call-activity";

/**
 * Call Log write layer.
 *
 * Logging an activity is a plain CRUD insert into an additive table — it records
 * self-reported activity and never writes a ledger event, so it can never touch
 * the money numbers. The mutation still runs through the same gate as the rest
 * of Sales: it re-checks the signed-in user against the allowlist (the form's
 * own check is a courtesy; THIS is the gate) and validates every field with zod
 * before it writes.
 */

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) {
    throw new Error("Not authorized.");
  }
  return user;
}

const trimmed = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s.length ? s : undefined))
  .optional();

const logActivityInput = z.object({
  mode: z.enum(["call", "booking"]).refine((m) => ACTIVITY_MODE_KEYS.includes(m)),
  clientId: z.string().uuid("Pick a team."),
  repId: z.string().uuid().optional(),
  callType: z
    .string()
    .refine((k) => CALL_TYPE_KEYS.includes(k), "Unknown call type.")
    .optional(),
  disposition: z
    .string()
    .refine((k) => DISPOSITION_KEYS.includes(k), "Unknown disposition."),
  recordingUrl: trimmed,
  leadUrl: trimmed,
  customerName: trimmed,
  customerEmail: trimmed,
  notes: trimmed,
});

export async function logActivity(raw: z.input<typeof logActivityInput>) {
  await requireUser();
  const input = logActivityInput.parse(raw);

  const db = getDb();

  // A rep's own team is authoritative, so the team can never be logged
  // inconsistently with the rep — the same rule the quota writer follows.
  let clientId = input.clientId;
  if (input.repId) {
    const [rep] = await db
      .select({ clientId: reps.clientId })
      .from(reps)
      .where(eq(reps.id, input.repId))
      .limit(1);
    if (!rep) throw new Error("Unknown rep.");
    clientId = rep.clientId;
  }

  const [row] = await db
    .insert(activityLogs)
    .values({
      mode: input.mode,
      clientId,
      repId: input.repId ?? null,
      callType: input.callType ?? null,
      disposition: input.disposition,
      recordingUrl: input.recordingUrl ?? null,
      leadUrl: input.leadUrl ?? null,
      customerName: input.customerName ?? null,
      customerEmail: input.customerEmail ?? null,
      notes: input.notes ?? null,
      source: "manual",
    })
    .returning();

  revalidatePath("/sales/call-log");
  return { id: row.id };
}
