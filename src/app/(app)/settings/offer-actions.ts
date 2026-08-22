"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, offerSettings } from "@/db/schema/app";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";

async function requireUser() {
  // Build phase: auth is off (see middleware DISABLE_AUTH).
  if (process.env.DISABLE_AUTH === "true") return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const input = z.object({
  clientId: z.string().uuid(),
  eodAlertTime: z.string().regex(TIME).nullable(),
  bodAlertTime: z.string().regex(TIME).nullable(),
  confettiThresholdDollars: z.coerce.number().min(0).max(10_000_000),
  monthlyGoalDollars: z.coerce.number().min(0).max(10_000_000),
  visibility: z.object({
    cash: z.boolean(),
    target: z.boolean(),
    apps: z.boolean(),
    drive: z.boolean(),
  }),
});

/** Upsert one offer's alert times + celebration threshold. */
export async function saveOfferSettings(raw: unknown) {
  await requireUser();
  const data = input.parse(raw);
  const db = getDb();
  await db
    .insert(offerSettings)
    .values({
      clientId: data.clientId,
      eodAlertTime: data.eodAlertTime,
      bodAlertTime: data.bodAlertTime,
      confettiThresholdCents: Math.round(data.confettiThresholdDollars * 100),
      visibility: data.visibility,
    })
    .onConflictDoUpdate({
      target: [offerSettings.clientId],
      set: {
        eodAlertTime: data.eodAlertTime,
        bodAlertTime: data.bodAlertTime,
        confettiThresholdCents: Math.round(data.confettiThresholdDollars * 100),
        visibility: data.visibility,
        updatedAt: new Date(),
      },
    });
  // The per-offer monthly goal IS the client target (one source of truth,
  // reused from the targets feature) — zero clears it.
  await db
    .update(clients)
    .set({
      monthlyTargetCents:
        data.monthlyGoalDollars > 0 ? Math.round(data.monthlyGoalDollars * 100) : null,
    })
    .where(eq(clients.id, data.clientId));
  revalidatePath("/settings");
  return { ok: true };
}
