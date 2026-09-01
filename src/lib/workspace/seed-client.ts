import "server-only";

import { eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { workspacePages } from "@/db/schema/app";
import {
  CLIENT_TEMPLATE_TITLE,
  copiedParentId,
  planTemplateCopy,
  remapPageLinks,
  type TemplatePage,
} from "@/lib/workspace/template";

/**
 * Give a client teamspace its starting content by COPYING the agency's Client
 * Template into it — the same thing you would do by hand in Notion, so a client
 * added in the app opens on a real workspace instead of an empty one.
 *
 * Safe to call on every client creation:
 *   • it does NOTHING when the client already has pages (never clobbers work),
 *   • it does NOTHING when the template is missing,
 *   • internal `?page=` links are re-pointed at the COPIES, so the new teamspace
 *     is self-contained and never links back into the agency template,
 *   • it is best-effort — a failure here must not fail creating the client, so
 *     callers treat a thrown error as "no seed", not "no client".
 */
export async function seedClientWorkspaceFromTemplate(
  clientId: string,
): Promise<{ copied: number }> {
  const db = getDb();

  // Never seed a teamspace that already has anything in it.
  const existing = await db
    .select({ id: workspacePages.id })
    .from(workspacePages)
    .where(eq(workspacePages.clientId, clientId))
    .limit(1);
  if (existing.length > 0) return { copied: 0 };

  // The agency template: the top-level "Client Template" page and everything
  // beneath it.
  const agencyPages = await db
    .select()
    .from(workspacePages)
    .where(isNull(workspacePages.clientId));
  const root = agencyPages.find(
    (p) => p.parentId === null && p.title.trim() === CLIENT_TEMPLATE_TITLE,
  );
  if (!root) return { copied: 0 };

  const byParent = new Map<string, typeof agencyPages>();
  for (const p of agencyPages) {
    if (!p.parentId) continue;
    const list = byParent.get(p.parentId) ?? [];
    list.push(p);
    byParent.set(p.parentId, list);
  }
  // Walk the template subtree.
  const subtree: TemplatePage[] = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    subtree.push({
      id: node.id,
      parentId: node.parentId,
      title: node.title,
      icon: node.icon,
      content: node.content,
      sortOrder: node.sortOrder,
    });
    stack.push(...(byParent.get(node.id) ?? []));
  }

  // Insert parents before children so each child can point at its parent's copy.
  const idMap = new Map<string, string>();
  const ordered = planTemplateCopy(subtree);
  for (const page of ordered) {
    const [row] = await db
      .insert(workspacePages)
      .values({
        clientId,
        parentId: copiedParentId(page, idMap),
        title: page.title,
        icon: page.icon,
        // Content is written now and re-pointed below, once every copy has an id.
        content: page.content,
        isHome: false,
        sortOrder: page.sortOrder,
      })
      .returning({ id: workspacePages.id });
    idMap.set(page.id, row.id);
  }

  // Second pass: re-point internal links at the copies.
  for (const page of ordered) {
    const nextContent = remapPageLinks(page.content, idMap);
    if (nextContent === page.content) continue;
    const copyId = idMap.get(page.id);
    if (!copyId) continue;
    await db
      .update(workspacePages)
      .set({ content: nextContent })
      .where(eq(workspacePages.id, copyId));
  }

  return { copied: idMap.size };
}
