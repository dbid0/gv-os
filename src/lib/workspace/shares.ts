import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { workspacePages, workspaceShares } from "@/db/schema/app";
import {
  buildPageTree,
  flattenTree,
  isDescendantOrSelf,
  pageBreadcrumb,
  type WorkspacePageLite,
} from "@/lib/workspace/tree";

/**
 * The Workspace SHARE read layer — the server-side half of "Share to web".
 *
 * Two jobs: tell the in-app dialog whether a page is currently shared, and
 * resolve a public `/share/<token>` request into exactly the page it is allowed
 * to render. Both are FAIL-SOFT: a database hiccup returns "not shared" / null
 * rather than throwing, so a wiki outage degrades to a 404, never a stack trace
 * on a public URL.
 *
 * THE GUARDRAIL lives here: a token exposes one page and (optionally) its own
 * descendants, and NOTHING else. Every `?p=` child id is checked against the
 * shared subtree with the pure `isDescendantOrSelf` before a single field is
 * read out, so a hand-edited id pointing at a sibling, a parent, or another
 * teamspace resolves to null.
 */

/** What the Share dialog needs to show its current state. */
export interface ShareState {
  token: string;
  includeChildren: boolean;
}

/** A crumb / sub-page link inside a shared subtree. */
export interface ShareCrumb {
  id: string;
  title: string;
  icon: string | null;
}

/** Everything the public read-only page renders, already access-checked. */
export interface ShareView {
  token: string;
  includeChildren: boolean;
  /** The page being shown (the root, or an in-subtree descendant via `?p=`). */
  page: { id: string; title: string; icon: string | null; content: string | null };
  /** Root → current page, within the shared subtree only (never above root). */
  breadcrumb: ShareCrumb[];
  /** The current page's direct children, shown as links (empty if not included). */
  children: ShareCrumb[];
}

function toLite(row: typeof workspacePages.$inferSelect): WorkspacePageLite {
  return {
    id: row.id,
    clientId: row.clientId,
    parentId: row.parentId,
    title: row.title,
    icon: row.icon,
    content: row.content,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The live (non-revoked) share for a page, or null. Powers the dialog toggle —
 * "Share to web" is ON exactly when this returns a token.
 */
export async function getShareForPage(pageId: string): Promise<ShareState | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        token: workspaceShares.token,
        includeChildren: workspaceShares.includeChildren,
      })
      .from(workspaceShares)
      .where(and(eq(workspaceShares.pageId, pageId), isNull(workspaceShares.revokedAt)))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a public share request. `childId` is the optional `?p=` param — a
 * descendant of the shared page to show under the same token. Returns null for
 * anything not allowed: an unknown or revoked token, a deleted page, a child id
 * outside the shared subtree, or a child id at all when sub-pages aren't
 * included. That single null is what the route turns into `notFound()`.
 */
export async function getShareView(
  token: string,
  childId?: string,
): Promise<ShareView | null> {
  try {
    const db = getDb();

    const [share] = await db
      .select()
      .from(workspaceShares)
      .where(and(eq(workspaceShares.token, token), isNull(workspaceShares.revokedAt)))
      .limit(1);
    if (!share) return null;

    const [root] = await db
      .select()
      .from(workspacePages)
      .where(eq(workspacePages.id, share.pageId))
      .limit(1);
    if (!root) return null;

    // Every page in the shared page's teamspace — the universe the descendant
    // check and the tree are built from. Scoped by clientId so a child id can
    // never resolve into another teamspace.
    const rows = await db
      .select()
      .from(workspacePages)
      .where(
        root.clientId === null
          ? isNull(workspacePages.clientId)
          : eq(workspacePages.clientId, root.clientId),
      );
    const lite = rows.map(toLite);

    // Decide the target page. Only the root is viewable unless sub-pages are
    // included; any child id is verified to be within the shared subtree.
    let targetId = root.id;
    if (childId && childId !== root.id) {
      if (!share.includeChildren) return null;
      if (!isDescendantOrSelf(lite, root.id, childId)) return null;
      targetId = childId;
    }

    const target = lite.find((p) => p.id === targetId);
    if (!target) return null;

    // Breadcrumb trimmed to start AT the shared root — never expose ancestors
    // above it, even though they exist in the teamspace.
    const fullChain = pageBreadcrumb(lite, target.id);
    const rootIdx = fullChain.findIndex((p) => p.id === root.id);
    const breadcrumb = (rootIdx >= 0 ? fullChain.slice(rootIdx) : [target]).map(
      (p) => ({ id: p.id, title: p.title, icon: p.icon }),
    );

    // Direct children (only when included), in the same stable order the tree
    // uses everywhere else.
    let children: ShareCrumb[] = [];
    if (share.includeChildren) {
      const node = flattenTree(buildPageTree(lite)).find((n) => n.id === target.id);
      children = (node?.children ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        icon: c.icon,
      }));
    }

    return {
      token: share.token,
      includeChildren: share.includeChildren,
      page: {
        id: target.id,
        title: target.title,
        icon: target.icon,
        content: target.content,
      },
      breadcrumb,
      children,
    };
  } catch {
    return null;
  }
}
