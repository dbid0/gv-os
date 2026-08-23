"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { notifications } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

export async function markNotificationRead(id: string) {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) throw new Error("Bad id.");
  const db = getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, id));
  revalidatePath("/notifications");
  return { ok: true };
}

/** One click on a grouped stack of duplicates reads the whole stack. */
export async function markNotificationsRead(ids: string[]) {
  await requireUser();
  const parsed = z.array(z.string().uuid()).min(1).max(200).parse(ids);
  const db = getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(inArray(notifications.id, parsed));
  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllNotificationsRead() {
  await requireUser();
  const db = getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(isNull(notifications.readAt));
  revalidatePath("/notifications");
  return { ok: true };
}
