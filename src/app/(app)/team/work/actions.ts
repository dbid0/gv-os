"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { actionItems } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";

async function requireUser() {
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

const createInput = z.object({
  title: z.string().min(1, "Give the work a title.").max(300),
  clientId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  cadence: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  notes: z.string().max(1000).optional(),
});

export async function createWorkItem(raw: z.input<typeof createInput>) {
  await requireUser();
  const input = createInput.parse(raw);
  const db = getDb();
  const [row] = await db
    .insert(actionItems)
    .values({
      title: input.title.trim(),
      clientId: input.clientId ?? null,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
      cadence: input.cadence,
      status: "not_started",
      notes: input.notes?.trim() || null,
    })
    .returning({ id: actionItems.id });
  revalidatePath("/team/work");
  revalidatePath("/calendar");
  return { id: row.id };
}

const STATUSES = ["not_started", "in_progress", "completed"] as const;

export async function setWorkItemStatus(id: string, status: string) {
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
  revalidatePath("/team/work");
  revalidatePath("/calendar");
  return { ok: true };
}

export async function assignWorkItem(id: string, assigneeId: string | null) {
  await requireUser();
  const itemId = z.string().uuid().parse(id);
  const assignee = assigneeId ? z.string().uuid().parse(assigneeId) : null;
  const db = getDb();
  await db
    .update(actionItems)
    .set({ assigneeId: assignee, updatedAt: new Date() })
    .where(eq(actionItems.id, itemId));
  revalidatePath("/team/work");
  return { ok: true };
}
