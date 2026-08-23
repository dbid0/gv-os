"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { paymentEvents, transactions } from "@/db/schema/app";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { dayKeyCT } from "@/lib/charts";
import { paymentEventToTransaction } from "@/lib/transactions/confirm";

async function requireUser() {
  // Build phase: auth is off (see middleware DISABLE_AUTH).
  if (process.env.DISABLE_AUTH === "true") return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

const id = z.string().uuid();

function revalidateMoneySurfaces() {
  revalidatePath("/accounting/payments");
  revalidatePath("/accounting/transactions");
  revalidatePath("/accounting");
  revalidatePath("/dashboard");
}

/**
 * Post one captured processor event to the backlog (punch-list 15). The
 * append is idempotent on processor:<provider>:<event id>; the event flips
 * to posted only after the row exists, so a crash between the two steps
 * re-offers the confirm and the conflict target makes the retry free.
 */
export async function confirmPaymentEvent(raw: unknown) {
  await requireUser();
  const eventId = id.parse(raw);
  const db = getDb();
  const [event] = await db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.id, eventId))
    .limit(1);
  if (!event) return { ok: false as const, error: "Event not found." };
  if (event.status !== "captured") {
    return { ok: false as const, error: `Already ${event.status}.` };
  }

  const occurredOn = dayKeyCT(event.occurredAt ?? event.createdAt);
  const mapping = paymentEventToTransaction(event, occurredOn);
  if (!mapping.ok) return { ok: false as const, error: mapping.reason };

  await db
    .insert(transactions)
    .values(mapping.row)
    .onConflictDoNothing({ target: [transactions.idempotencyKey] });
  await db
    .update(paymentEvents)
    .set({ status: "posted" })
    .where(eq(paymentEvents.id, eventId));

  revalidateMoneySurfaces();
  return { ok: true as const };
}

/** Park a captured event as ignored — nothing posts, the record stays. */
export async function dismissPaymentEvent(raw: unknown) {
  await requireUser();
  const eventId = id.parse(raw);
  const db = getDb();
  const updated = await db
    .update(paymentEvents)
    .set({ status: "ignored" })
    .where(and(eq(paymentEvents.id, eventId), eq(paymentEvents.status, "captured")))
    .returning({ id: paymentEvents.id });
  if (updated.length === 0) {
    return { ok: false as const, error: "Not in the queue anymore." };
  }
  revalidateMoneySurfaces();
  return { ok: true as const };
}
