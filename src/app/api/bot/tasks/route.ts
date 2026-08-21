import { NextResponse, type NextRequest } from "next/server";
import { asc, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { actionItems, teamMembers } from "@/db/schema/app";
import { botAuthorized } from "@/lib/bot-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Discord bot's window into the action list.
 *
 * The bot polls #tasks in the agency server, creates items from `+ <title>`
 * messages, completes them from `done <n>`, and posts the open list — this
 * API is the whole contract. Auth: src/lib/bot-auth.ts.
 */

/** GET → every non-completed item, oldest due first. */
export async function GET(req: NextRequest) {
  if (!botAuthorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const db = getDb();
  const items = await db
    .select({
      id: actionItems.id,
      title: actionItems.title,
      cadence: actionItems.cadence,
      status: actionItems.status,
      dueDate: actionItems.dueDate,
      assignee: teamMembers.name,
      legacyAssignee: actionItems.assignee,
    })
    .from(actionItems)
    .leftJoin(teamMembers, eq(actionItems.assigneeId, teamMembers.id))
    .where(ne(actionItems.status, "completed"))
    .orderBy(asc(actionItems.dueDate), desc(actionItems.createdAt));
  return NextResponse.json({
    ok: true,
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      cadence: i.cadence,
      status: i.status,
      dueDate: i.dueDate,
      assignee: i.assignee ?? i.legacyAssignee,
    })),
  });
}

const createInput = z.object({
  title: z.string().min(1).max(300),
  cadence: z.enum(["daily", "weekly", "monthly"]).optional(),
  /** A roster member's name, matched case-insensitively when present. */
  assignee: z.string().optional(),
});

/** POST → create an item from Discord. */
export async function POST(req: NextRequest) {
  if (!botAuthorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const parsed = createInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad input." }, { status: 400 });
  }
  const db = getDb();
  let assigneeId: string | null = null;
  if (parsed.data.assignee) {
    const members = await db
      .select({ id: teamMembers.id, name: teamMembers.name })
      .from(teamMembers)
      .where(eq(teamMembers.status, "active"));
    const wanted = parsed.data.assignee.trim().toLowerCase();
    assigneeId =
      members.find(
        (m) =>
          m.name.toLowerCase() === wanted || m.name.toLowerCase().startsWith(wanted),
      )?.id ?? null;
  }
  const [item] = await db
    .insert(actionItems)
    .values({
      title: parsed.data.title.trim(),
      cadence: parsed.data.cadence ?? "daily",
      status: "not_started",
      assigneeId,
    })
    .returning({ id: actionItems.id, title: actionItems.title });
  return NextResponse.json({ ok: true, item });
}
