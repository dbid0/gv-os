"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { bookings } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { upsertConfirmation } from "@/lib/crm/confirmation-store";

/**
 * Confirmation write layer. Recording a confirmation is an additive note on a
 * booking — it never touches money or the booking mirror itself. The gate is
 * the same as every Sales mutation: allowlisted user or nothing. The booking
 * row is the authority for which client the confirmation belongs to — the
 * form only ever names the booking.
 */

const input = z.object({
  bookingId: z.string().uuid(),
  role: z.enum(["setter", "dialer", "dm_setter"]),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
});

export async function confirmBooking(formData: FormData): Promise<void> {
  let confirmedBy: string | null = null;
  if (!devAuthBypass()) {
    const user = await currentUser();
    if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
    confirmedBy = user.email;
  }

  const parsed = input.parse({
    bookingId: formData.get("bookingId"),
    role: formData.get("role"),
    slug: formData.get("slug"),
  });

  const db = getDb();
  const [booking] = await db
    .select({ id: bookings.id, clientId: bookings.clientId })
    .from(bookings)
    .where(eq(bookings.id, parsed.bookingId))
    .limit(1);
  if (!booking) throw new Error("Unknown booking.");

  await upsertConfirmation({
    bookingId: booking.id,
    clientId: booking.clientId,
    confirmedAt: new Date(),
    confirmedBy,
    confirmedRole: parsed.role,
  });

  revalidatePath(`/w/${parsed.slug}/crm`);
  revalidatePath(`/w/${parsed.slug}/sales`);
  revalidatePath(`/w/${parsed.slug}/calls`);
}
