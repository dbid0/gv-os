"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { workspacePages } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { collectSubtreeIds } from "@/lib/workspace/tree";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

const uuidOrNull = z.string().uuid().nullable().optional();

const createInput = z.object({
  clientId: uuidOrNull,
  parentId: uuidOrNull,
  title: z.string().optional(),
});

/**
 * Create a page in a teamspace (clientId null = agency), optionally nested under
 * a parent. It lands at the end of its sibling list, so a new page never jumps
 * above the ones already there.
 */
export async function createPage(raw: z.input<typeof createInput>) {
  await requireUser();
  const input = createInput.parse(raw);
  const clientId = input.clientId ?? null;
  const parentId = input.parentId ?? null;
  const db = getDb();

  // Append after existing siblings in the same teamspace + parent scope. Both
  // keys can be null (a top-level agency page), which a WHERE can't compare
  // cleanly, so the scoping is done in JS over a narrow projection.
  const existing = await db
    .select({
      clientId: workspacePages.clientId,
      parentId: workspacePages.parentId,
      sortOrder: workspacePages.sortOrder,
    })
    .from(workspacePages);
  const nextOrder =
    existing
      .filter((s) => s.clientId === clientId && s.parentId === parentId)
      .reduce((max, s) => Math.max(max, s.sortOrder), -1) + 1;

  const [page] = await db
    .insert(workspacePages)
    .values({
      clientId,
      parentId,
      title: input.title?.trim() || "Untitled",
      sortOrder: nextOrder,
    })
    .returning({ id: workspacePages.id });

  revalidatePath("/workspace");
  return { id: page.id };
}

const updateInput = z.object({
  title: z.string().optional(),
  icon: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
});

/** Patch a page's title, icon, and/or body. Only provided fields change. */
export async function updatePage(id: string, raw: z.input<typeof updateInput>) {
  await requireUser();
  const pageId = z.string().uuid().parse(id);
  const input = updateInput.parse(raw);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title.trim() || "Untitled";
  if (input.icon !== undefined) patch.icon = input.icon || null;
  if (input.content !== undefined) patch.content = input.content;

  const db = getDb();
  await db.update(workspacePages).set(patch).where(eq(workspacePages.id, pageId));

  revalidatePath("/workspace");
  return { ok: true };
}

/**
 * Delete a page and every descendant under it. The whole subtree goes in one
 * statement — Postgres checks the self-FK at statement end, so parent and
 * children removing together is fine — and a page with no children is just a
 * subtree of one.
 */
export async function deletePage(id: string) {
  await requireUser();
  const pageId = z.string().uuid().parse(id);
  const db = getDb();

  const all = await db
    .select({ id: workspacePages.id, parentId: workspacePages.parentId })
    .from(workspacePages);
  const ids = collectSubtreeIds(all, pageId);
  if (ids.length === 0) return { ok: true, deleted: 0 };

  await db.delete(workspacePages).where(inArray(workspacePages.id, ids));

  revalidatePath("/workspace");
  return { ok: true, deleted: ids.length };
}

const moveInput = z.object({
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * Re-parent and/or re-order a page. Optional polish for now — the tree renders
 * without it — but it keeps the ordering model honest for a future drag layer.
 */
export async function movePage(id: string, raw: z.input<typeof moveInput>) {
  await requireUser();
  const pageId = z.string().uuid().parse(id);
  const input = moveInput.parse(raw);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.parentId !== undefined) patch.parentId = input.parentId;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

  const db = getDb();
  await db.update(workspacePages).set(patch).where(eq(workspacePages.id, pageId));

  revalidatePath("/workspace");
  return { ok: true };
}
