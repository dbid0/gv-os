/**
 * Copying the agency's Client Template into a client's own teamspace — the pure
 * half, so the reshaping is unit-tested without a database.
 *
 * A template is a small forest of pages that link to EACH OTHER by id
 * (`?page=<uuid>`). Copying it therefore is not just "insert the rows": every
 * internal link has to be re-pointed at the COPY, or a client's fresh workspace
 * silently links back into the agency's template. {@link remapPageLinks} is that
 * re-pointing, and {@link planTemplateCopy} is the parent-before-child order the
 * inserts must run in.
 */

/** The title of the agency page that seeds every new client teamspace. */
export const CLIENT_TEMPLATE_TITLE = "Client Template";

/** The subset of a page row this module needs. */
export interface TemplatePage {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  content: string | null;
  sortOrder: number;
}

/**
 * Rewrite every `?page=<old>` link to point at the copied page instead. Ids with
 * no entry in `idMap` are left ALONE — a link out to a page that wasn't part of
 * the copied subtree should keep working, not break.
 */
export function remapPageLinks(
  content: string | null,
  idMap: ReadonlyMap<string, string>,
): string | null {
  if (!content) return content;
  return content.replace(
    /\?page=([0-9a-fA-F-]{36})/g,
    (whole, id: string) => `?page=${idMap.get(id) ?? id}`,
  );
}

/**
 * Order `pages` so a page always appears AFTER its parent, and re-root the
 * subtree: the template's own root (the page whose parent is outside the set)
 * becomes top-level in the copy. Throws on a cycle rather than looping forever.
 */
export function planTemplateCopy(pages: TemplatePage[]): TemplatePage[] {
  const ids = new Set(pages.map((p) => p.id));
  const ordered: TemplatePage[] = [];
  const placed = new Set<string>();
  let remaining = pages.slice();

  while (remaining.length > 0) {
    // A page is ready when its parent is outside the subtree (it re-roots) or
    // has already been placed.
    const ready = remaining.filter(
      (p) => p.parentId === null || !ids.has(p.parentId) || placed.has(p.parentId),
    );
    if (ready.length === 0) {
      throw new Error("Template pages form a cycle; cannot copy.");
    }
    for (const p of ready) {
      ordered.push(p);
      placed.add(p.id);
    }
    remaining = remaining.filter((p) => !placed.has(p.id));
  }
  return ordered;
}

/**
 * The parent a copied page should get: the COPY of its parent when the parent
 * came along, otherwise null (it becomes a top-level page in the new teamspace).
 */
export function copiedParentId(
  page: TemplatePage,
  idMap: ReadonlyMap<string, string>,
): string | null {
  if (!page.parentId) return null;
  return idMap.get(page.parentId) ?? null;
}
