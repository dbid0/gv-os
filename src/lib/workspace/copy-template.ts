/**
 * Copying the agency Client Template into a client teamspace.
 *
 * The implementation lives here rather than behind `server-only` so the
 * backfill script can run the SAME code against an existing database. There is
 * one definition of what a client's onboarding section contains; a script that
 * reimplemented the copy in SQL would drift from it the first time the template
 * changed shape.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/postgres-js";

import type * as schema from "@/db/schema";

import { clients, workspacePages } from "@/db/schema/app";

/** A Drizzle handle over the app schema — the app's, or a script's own. */
export type WorkspaceDb = ReturnType<typeof drizzle<typeof schema>>;
import {
  CLIENT_TEMPLATE_TITLE,
  copiedParentId,
  hasOnboardingSpace,
  onboardingRootIcon,
  onboardingSpaceTitle,
  planTemplateCopy,
  remapPageLinks,
  type TemplatePage,
} from "@/lib/workspace/template";

/**
 * Give a client teamspace its starting content by COPYING the agency's Client
 * Template into it — the same thing you would do by hand in Notion, so a client
 * added in the app opens on a real workspace instead of an empty one.
 *
 * Safe to call on every client creation AND on a client that already has
 * imported Notion content:
 *   • it does NOTHING when the onboarding section is already there,
 *   • it does NOTHING when the template is missing,
 *   • internal `?page=` links are re-pointed at the COPIES, so the new teamspace
 *     is self-contained and never links back into the agency template,
 *   • it is best-effort — a failure here must not fail creating the client, so
 *     callers treat a thrown error as "no seed", not "no client".
 */
export async function copyTemplateIntoClient(
  db: WorkspaceDb,
  clientId: string,
): Promise<{ copied: number }> {
  const [client] = await db
    .select({ name: clients.name, logo: clients.logo })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { copied: 0 };

  // Skip only when the ONBOARDING SECTION is already there — not when the
  // teamspace merely has pages. The old check was "has any page at all", so a
  // client whose real Notion was imported first (The Grid, The Vault) counted
  // as seeded and never received one. Existing pages are still never touched:
  // this only ever ADDS a section alongside them.
  const roots = await db
    .select({ title: workspacePages.title })
    .from(workspacePages)
    .where(and(eq(workspacePages.clientId, clientId), isNull(workspacePages.parentId)));
  if (
    hasOnboardingSpace(
      roots.map((r) => r.title),
      client.name,
    )
  ) {
    return { copied: 0 };
  }

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

  // The section lands under the CLIENT's name wearing the CLIENT's logo — a
  // client's workspace should never open on a page called "Client Template"
  // with the agency's mark on it. Children keep their own titles and icons.
  const sortAfter = await nextRootSortOrder(db, clientId);

  // Insert parents before children so each child can point at its parent's copy.
  const idMap = new Map<string, string>();
  const ordered = planTemplateCopy(subtree);
  for (const page of ordered) {
    const isRoot = page.id === root.id;
    const [row] = await db
      .insert(workspacePages)
      .values({
        clientId,
        parentId: copiedParentId(page, idMap),
        title: isRoot ? onboardingSpaceTitle(client.name) : page.title,
        icon: isRoot ? onboardingRootIcon(client.logo, page.icon) : page.icon,
        // Content is written now and re-pointed below, once every copy has an id.
        content: page.content,
        isHome: false,
        sortOrder: isRoot ? sortAfter : page.sortOrder,
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

/**
 * Where the new section sits in the client's rail: after everything already
 * there, so adding it never reshuffles pages the client is used to.
 */
async function nextRootSortOrder(db: WorkspaceDb, clientId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${workspacePages.sortOrder})` })
    .from(workspacePages)
    .where(and(eq(workspacePages.clientId, clientId), isNull(workspacePages.parentId)));
  return (row?.max ?? 0) + 1;
}
