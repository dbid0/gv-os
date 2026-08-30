/**
 * The Workspace page tree — pure, so the server queries, the client sidebar,
 * and the tests all build the exact same nesting from the exact same code.
 *
 * A flat list of pages goes in; a forest of nodes comes out. Ordering is
 * stable — `sortOrder`, then title, then id — so a rebuild never reshuffles a
 * tree under the reader. Nothing here touches the database or React; it is just
 * data-shaping, which is why it can be unit-tested exhaustively.
 */

/** The minimum a page needs to be placed in the tree (plus what the UI shows). */
export interface WorkspacePageLite {
  id: string;
  clientId: string | null;
  parentId: string | null;
  title: string;
  icon: string | null;
  content: string | null;
  sortOrder: number;
  /** ISO timestamp of the last edit, for the "Edited …" header chip. */
  updatedAt?: string;
}

/** A placed page: the same fields plus its children and its depth in the tree. */
export interface PageNode extends WorkspacePageLite {
  depth: number;
  children: PageNode[];
}

function compare(a: WorkspacePageLite, b: WorkspacePageLite): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;
  return a.id.localeCompare(b.id);
}

/**
 * Build the parent→children forest from a flat page list.
 *
 * Roots are pages with no parent, plus any page whose parent is not in the list
 * (an orphan is surfaced at the top rather than silently lost). Every level is
 * sorted stably, and `depth` is stamped as the tree is walked.
 */
export function buildPageTree(pages: WorkspacePageLite[]): PageNode[] {
  const nodes = new Map<string, PageNode>();
  for (const page of pages) {
    nodes.set(page.id, { ...page, depth: 0, children: [] });
  }

  const roots: PageNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const stampDepth = (list: PageNode[], depth: number) => {
    list.sort(compare);
    for (const node of list) {
      node.depth = depth;
      stampDepth(node.children, depth + 1);
    }
  };
  stampDepth(roots, 0);

  return roots;
}

/** Walk a forest into a flat list, parents before their children (render order). */
export function flattenTree(nodes: PageNode[]): PageNode[] {
  const out: PageNode[] = [];
  const walk = (list: PageNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Every id in the subtree rooted at `rootId`, including the root itself, in
 * top-down order. Used to delete a page and all its descendants in one shot.
 */
export function collectSubtreeIds(
  pages: Pick<WorkspacePageLite, "id" | "parentId">[],
  rootId: string,
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.parentId) continue;
    const list = childrenOf.get(page.parentId) ?? [];
    list.push(page.id);
    childrenOf.set(page.parentId, list);
  }

  const ids: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    for (const child of childrenOf.get(id) ?? []) queue.push(child);
  }
  return ids;
}

/**
 * Is `candidateId` the subtree root `rootId` itself, or one of its descendants?
 *
 * This is the PUBLIC-SHARE GUARD in pure form: a shared link exposes one page
 * and (optionally) everything under it, never a parent, a sibling, or another
 * teamspace. The server calls this on every `?p=` param before rendering, so a
 * hand-edited id that points outside the shared subtree is rejected. Built on
 * `collectSubtreeIds`, which includes the root — so viewing the root page
 * itself is always allowed.
 */
export function isDescendantOrSelf(
  pages: Pick<WorkspacePageLite, "id" | "parentId">[],
  rootId: string,
  candidateId: string,
): boolean {
  if (candidateId === rootId) return true;
  return collectSubtreeIds(pages, rootId).includes(candidateId);
}

/** What a move writes: the moved page's new parent, and every sibling's new order. */
export interface MovePlan {
  /** The moved page's new parent (null = top-level in the teamspace). */
  parentId: string | null;
  /** Sequential `sortOrder` (0, 1, 2 …) for the destination sibling list. */
  updates: { id: string; sortOrder: number }[];
}

/** The stable sibling order — sortOrder, then title, then id (mirrors buildPageTree). */
function siblingCompare(
  a: Pick<WorkspacePageLite, "sortOrder" | "title" | "id">,
  b: Pick<WorkspacePageLite, "sortOrder" | "title" | "id">,
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;
  return a.id.localeCompare(b.id);
}

/**
 * Plan a drag-and-drop move: re-parent `moveId` under `newParentId` and slot it
 * immediately before `beforeId` (or at the end of the sibling list when
 * `beforeId` is null). It is PURE, so the server action and the client's
 * optimistic update run the exact same reasoning off the exact same inputs.
 *
 * Returns null for an impossible move — an unknown page, or dropping a page onto
 * itself or one of its own descendants (which would orphan the subtree). The
 * destination siblings are scoped to the moved page's own teamspace (clientId)
 * and re-indexed to a clean sequential `sortOrder`, so ordering stays stable no
 * matter how the rows collided before.
 */
export function planMove(
  pages: Pick<
    WorkspacePageLite,
    "id" | "clientId" | "parentId" | "sortOrder" | "title"
  >[],
  moveId: string,
  newParentId: string | null,
  beforeId: string | null,
): MovePlan | null {
  const moved = pages.find((p) => p.id === moveId);
  if (!moved) return null;

  // Never nest a page into itself or its own subtree — that would strand the
  // whole branch as an orphan.
  if (newParentId === moveId) return null;
  if (newParentId !== null) {
    const parentExists = pages.some((p) => p.id === newParentId);
    if (!parentExists) return null;
    const subtree = new Set(collectSubtreeIds(pages, moveId));
    if (subtree.has(newParentId)) return null;
  }

  const siblings = pages
    .filter(
      (p) =>
        p.id !== moveId &&
        (p.clientId ?? null) === (moved.clientId ?? null) &&
        (p.parentId ?? null) === (newParentId ?? null),
    )
    .sort(siblingCompare);

  let insertAt = siblings.length;
  if (beforeId !== null) {
    const idx = siblings.findIndex((s) => s.id === beforeId);
    if (idx >= 0) insertAt = idx;
  }

  const ordered = [
    ...siblings.slice(0, insertAt).map((s) => s.id),
    moveId,
    ...siblings.slice(insertAt).map((s) => s.id),
  ];

  return {
    parentId: newParentId ?? null,
    updates: ordered.map((id, i) => ({ id, sortOrder: i })),
  };
}

/**
 * The ancestor chain for a page — its teamspace root first, the page itself
 * last — used to draw the breadcrumb. A broken parent link stops the walk
 * rather than looping forever.
 */
export function pageBreadcrumb(
  pages: WorkspacePageLite[],
  id: string,
): WorkspacePageLite[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const chain: WorkspacePageLite[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}
