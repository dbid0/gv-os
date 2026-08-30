"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { workspacePages, workspaceShares, workspaceTodos } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { getShareForPage, type ShareState } from "@/lib/workspace/shares";
import { generateShareToken } from "@/lib/workspace/share-token";
import { collectSubtreeIds, planMove } from "@/lib/workspace/tree";
import {
  isTodoStatus,
  normalizeTodoStatus,
  planTodoReorder,
  type TodoRow,
} from "@/lib/workspace/todos";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

/** The signed-in email for an audit trail, best-effort (null under dev bypass). */
async function currentEmail(): Promise<string | null> {
  try {
    const user = await currentUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
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
  /** The new parent (null = top-level). Omitted = keep the current parent. */
  parentId: z.string().uuid().nullable().optional(),
  /** Slot the page immediately before this sibling; null/omitted = at the end. */
  beforeId: z.string().uuid().nullable().optional(),
});

/**
 * Drag-and-drop move: re-parent a page and slot it before `beforeId` (or at the
 * end) among its new siblings. The whole affected sibling row is re-indexed to a
 * clean sequential `sortOrder` via the pure `planMove`, which also refuses to
 * nest a page into its own descendant (that would orphan the subtree). The plan
 * is recomputed server-side from live data — the client's optimistic version is
 * never trusted — so a stale drag can't corrupt the ordering.
 */
export async function movePage(id: string, raw: z.input<typeof moveInput>) {
  await requireUser();
  const pageId = z.string().uuid().parse(id);
  const input = moveInput.parse(raw);
  const db = getDb();

  const all = await db
    .select({
      id: workspacePages.id,
      clientId: workspacePages.clientId,
      parentId: workspacePages.parentId,
      sortOrder: workspacePages.sortOrder,
      title: workspacePages.title,
    })
    .from(workspacePages);

  const moved = all.find((p) => p.id === pageId);
  if (!moved) throw new Error("Page not found.");

  const newParentId = input.parentId !== undefined ? input.parentId : moved.parentId;
  const plan = planMove(all, pageId, newParentId, input.beforeId ?? null);
  if (!plan) throw new Error("That move isn't allowed.");

  // Re-index every affected sibling. Only the moved page changes parent and gets
  // its edit time bumped; a reorder never rewrites a neighbour's "Edited …".
  for (const u of plan.updates) {
    if (u.id === pageId) {
      await db
        .update(workspacePages)
        .set({
          parentId: plan.parentId,
          sortOrder: u.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(workspacePages.id, u.id));
    } else if (u.sortOrder !== all.find((p) => p.id === u.id)?.sortOrder) {
      await db
        .update(workspacePages)
        .set({ sortOrder: u.sortOrder })
        .where(eq(workspacePages.id, u.id));
    }
  }

  revalidatePath("/workspace");
  return { ok: true };
}

/**
 * Duplicate a single page — same icon, body, and parent, titled "… (copy)" and
 * dropped in right after the original. The whole sibling row is re-indexed so
 * the copy lands exactly where it should regardless of any prior gaps. Nested
 * sub-pages are NOT cloned; the copy starts childless.
 */
export async function duplicatePage(id: string) {
  await requireUser();
  const pageId = z.string().uuid().parse(id);
  const db = getDb();

  const [src] = await db
    .select()
    .from(workspacePages)
    .where(eq(workspacePages.id, pageId))
    .limit(1);
  if (!src) throw new Error("Page not found.");

  const [copy] = await db
    .insert(workspacePages)
    .values({
      clientId: src.clientId,
      parentId: src.parentId,
      title: `${src.title} (copy)`,
      icon: src.icon,
      content: src.content,
      sortOrder: src.sortOrder + 1,
    })
    .returning({ id: workspacePages.id });

  // Re-index the sibling row so the copy sits directly after the original.
  const siblings = await db
    .select({
      id: workspacePages.id,
      clientId: workspacePages.clientId,
      parentId: workspacePages.parentId,
      sortOrder: workspacePages.sortOrder,
      title: workspacePages.title,
    })
    .from(workspacePages);

  const plan = planMove(siblings, copy.id, src.parentId, null);
  if (plan) {
    // Place the copy immediately after the source in the re-indexed row.
    const ids = plan.updates.map((u) => u.id).filter((rowId) => rowId !== copy.id);
    const srcIndex = ids.indexOf(pageId);
    const ordered = [
      ...ids.slice(0, srcIndex + 1),
      copy.id,
      ...ids.slice(srcIndex + 1),
    ];
    for (let i = 0; i < ordered.length; i++) {
      await db
        .update(workspacePages)
        .set({ sortOrder: i })
        .where(eq(workspacePages.id, ordered[i]));
    }
  }

  revalidatePath("/workspace");
  return { id: copy.id };
}

const shareInput = z.object({ includeChildren: z.boolean().optional() });

/**
 * Turn a page's public "Share to web" link ON, and return its token.
 *
 * IDEMPOTENT: a page has at most one live share. If one already exists this
 * reuses its token — flipping `includeChildren` in place when it changed — so
 * toggling "Include sub-pages" never rotates the URL out from under someone who
 * already has it. A fresh share mints a crypto-random token.
 */
export async function createShare(
  pageId: string,
  raw?: z.input<typeof shareInput>,
): Promise<{ token: string }> {
  await requireUser();
  const id = z.string().uuid().parse(pageId);
  const includeChildren = shareInput.parse(raw ?? {}).includeChildren ?? true;
  const db = getDb();

  const [existing] = await db
    .select()
    .from(workspaceShares)
    .where(and(eq(workspaceShares.pageId, id), isNull(workspaceShares.revokedAt)))
    .limit(1);

  if (existing) {
    if (existing.includeChildren !== includeChildren) {
      await db
        .update(workspaceShares)
        .set({ includeChildren })
        .where(eq(workspaceShares.id, existing.id));
    }
    return { token: existing.token };
  }

  const token = generateShareToken();
  await db.insert(workspaceShares).values({
    pageId: id,
    token,
    includeChildren,
    createdBy: await currentEmail(),
  });
  return { token };
}

/**
 * Turn a page's public link OFF. Revokes every live share for the page
 * (there is only one) by stamping `revokedAt`, so the URL 404s immediately
 * while the history of who shared it stays intact.
 */
export async function revokeShare(pageId: string): Promise<{ ok: true }> {
  await requireUser();
  const id = z.string().uuid().parse(pageId);
  const db = getDb();
  await db
    .update(workspaceShares)
    .set({ revokedAt: new Date() })
    .where(and(eq(workspaceShares.pageId, id), isNull(workspaceShares.revokedAt)));
  return { ok: true };
}

/** The current live share for a page, or null — for the dialog's initial state. */
export async function getShareState(pageId: string): Promise<ShareState | null> {
  await requireUser();
  const id = z.string().uuid().parse(pageId);
  return getShareForPage(id);
}

// --- Workspace To-Do database -------------------------------------------------
//
// The interactive task table on each teamspace's Home. Same auth gate and same
// pure re-index discipline as the page tree: `planTodoReorder` (mirroring
// `planMove`) is recomputed server-side from live data on every drag, so a
// stale client order can never corrupt the board.

/** Map a DB row to the serializable shape the client renders. */
function toTodoRow(row: typeof workspaceTodos.$inferSelect): TodoRow {
  return {
    id: row.id,
    clientId: row.clientId,
    task: row.task,
    status: normalizeTodoStatus(row.status),
    dueDate: row.dueDate,
    sortOrder: row.sortOrder,
  };
}

/** A `where` that scopes To-Dos to one teamspace (null clientId = agency). */
function todoScope(clientId: string | null) {
  return clientId === null
    ? isNull(workspaceTodos.clientId)
    : eq(workspaceTodos.clientId, clientId);
}

/** Every To-Do in a teamspace, in board order (sortOrder, then id). */
export async function listTodos(clientId: string | null): Promise<TodoRow[]> {
  await requireUser();
  const scope = uuidOrNull.parse(clientId) ?? null;
  const db = getDb();
  const rows = await db
    .select()
    .from(workspaceTodos)
    .where(todoScope(scope))
    .orderBy(asc(workspaceTodos.sortOrder), asc(workspaceTodos.id));
  return rows.map(toTodoRow);
}

/**
 * Add an empty To-Do at the END of a teamspace's board, so a new row never
 * jumps above the ones already there. Returns the created row for the client to
 * render and focus.
 */
export async function addTodo(clientId: string | null): Promise<TodoRow> {
  await requireUser();
  const scope = uuidOrNull.parse(clientId) ?? null;
  const db = getDb();

  const existing = await db
    .select({ sortOrder: workspaceTodos.sortOrder })
    .from(workspaceTodos)
    .where(todoScope(scope));
  const nextOrder = existing.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;

  const [row] = await db
    .insert(workspaceTodos)
    .values({ clientId: scope, task: "", sortOrder: nextOrder })
    .returning();

  revalidatePath("/workspace");
  return toTodoRow(row);
}

const todoUpdateInput = z.object({
  task: z.string().optional(),
  status: z.string().optional(),
  /** yyyy-mm-dd, or null to clear. */
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

/**
 * Patch a To-Do's task, status, and/or due date. Only provided fields change.
 * The status is VALIDATED against the three allowed values — an unknown status
 * is rejected, never written — so the column can only ever hold a real option.
 */
export async function updateTodo(
  id: string,
  raw: z.input<typeof todoUpdateInput>,
): Promise<{ ok: true }> {
  await requireUser();
  const todoId = z.string().uuid().parse(id);
  const input = todoUpdateInput.parse(raw);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.task !== undefined) patch.task = input.task;
  if (input.status !== undefined) {
    if (!isTodoStatus(input.status)) throw new Error("Invalid status.");
    patch.status = input.status;
  }
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;

  const db = getDb();
  await db.update(workspaceTodos).set(patch).where(eq(workspaceTodos.id, todoId));

  revalidatePath("/workspace");
  return { ok: true };
}

/** Delete one To-Do. */
export async function deleteTodo(id: string): Promise<{ ok: true }> {
  await requireUser();
  const todoId = z.string().uuid().parse(id);
  const db = getDb();
  await db.delete(workspaceTodos).where(eq(workspaceTodos.id, todoId));
  revalidatePath("/workspace");
  return { ok: true };
}

const reorderInput = z.object({
  /** Slot the row immediately before this one; null/omitted = at the end. */
  beforeId: z.string().uuid().nullable().optional(),
});

/**
 * Drag-and-drop reorder: pull the row out and slot it before `beforeId` (or at
 * the end), then re-index the whole board to a clean sequential `sortOrder` via
 * the pure `planTodoReorder`. The plan is recomputed from live data scoped to
 * the row's OWN teamspace — the client's optimistic order is never trusted — so
 * a stale drag can't scramble another board or corrupt the ordering.
 */
export async function reorderTodo(
  id: string,
  raw: z.input<typeof reorderInput>,
): Promise<{ ok: true }> {
  await requireUser();
  const todoId = z.string().uuid().parse(id);
  const input = reorderInput.parse(raw);
  const db = getDb();

  const [moved] = await db
    .select({ clientId: workspaceTodos.clientId })
    .from(workspaceTodos)
    .where(eq(workspaceTodos.id, todoId))
    .limit(1);
  if (!moved) throw new Error("To-Do not found.");

  const siblings = await db
    .select({ id: workspaceTodos.id, sortOrder: workspaceTodos.sortOrder })
    .from(workspaceTodos)
    .where(todoScope(moved.clientId));

  const plan = planTodoReorder(siblings, todoId, input.beforeId ?? null);
  if (!plan) throw new Error("That move isn't allowed.");

  const currentOrder = new Map(siblings.map((s) => [s.id, s.sortOrder]));
  for (const u of plan.updates) {
    // Only write rows whose order actually changed — a no-op drag is free.
    if (currentOrder.get(u.id) !== u.sortOrder) {
      await db
        .update(workspaceTodos)
        .set({ sortOrder: u.sortOrder })
        .where(eq(workspaceTodos.id, u.id));
    }
  }

  revalidatePath("/workspace");
  return { ok: true };
}
