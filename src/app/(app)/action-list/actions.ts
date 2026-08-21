"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { actionItems } from "@/db/schema/app";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";

async function requireUser() {
  // Build phase: auth is off (see middleware DISABLE_AUTH).
  if (process.env.DISABLE_AUTH === "true") return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

const createInput = z.object({
  title: z.string().min(1, "An action needs a title."),
  cadence: z.enum(["daily", "weekly", "monthly"]),
  dueDate: z.string().optional(),
  assignee: z.string().optional(),
  clientId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
});

export async function createActionItem(raw: z.input<typeof createInput>) {
  await requireUser();
  const input = createInput.parse(raw);
  const db = getDb();
  const [item] = await db
    .insert(actionItems)
    .values({
      title: input.title,
      cadence: input.cadence,
      status: "not_started",
      dueDate: input.dueDate?.trim() ? input.dueDate : null,
      assignee: input.assignee?.trim() || null,
      clientId: input.clientId ?? null,
      notes: input.notes?.trim() || null,
    })
    .returning();
  revalidatePath("/action-list");
  return { id: item.id };
}

const STATUSES = ["not_started", "in_progress", "completed"] as const;

export async function setActionStatus(id: string, status: string) {
  await requireUser();
  const itemId = z.string().uuid().parse(id);
  const next = z.enum(STATUSES).parse(status);
  const db = getDb();
  await db
    .update(actionItems)
    .set({
      status: next,
      completedAt: next === "completed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(actionItems.id, itemId));
  revalidatePath("/action-list");
  return { ok: true };
}

export async function deleteActionItem(id: string) {
  await requireUser();
  const itemId = z.string().uuid().parse(id);
  const db = getDb();
  await db.delete(actionItems).where(eq(actionItems.id, itemId));
  revalidatePath("/action-list");
  return { ok: true };
}
