import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { actionItems } from "@/db/schema/app";
import { botAuthorized } from "@/lib/bot-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchInput = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]),
});

/** PATCH → advance one item's status from Discord. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!botAuthorized(req)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const itemId = z.string().uuid().safeParse(id);
  const parsed = patchInput.safeParse(await req.json().catch(() => null));
  if (!itemId.success || !parsed.success) {
    return NextResponse.json({ error: "Bad input." }, { status: 400 });
  }
  const db = getDb();
  const [updated] = await db
    .update(actionItems)
    .set({
      status: parsed.data.status,
      completedAt: parsed.data.status === "completed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(actionItems.id, itemId.data))
    .returning({ id: actionItems.id, title: actionItems.title });
  if (!updated) {
    return NextResponse.json({ error: "No such task." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, item: updated });
}
