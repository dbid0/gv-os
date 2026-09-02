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
import { isImageIcon } from "@/lib/workspace/emoji-data";

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

/**
 * What a client's copy of the agency template is CALLED in their teamspace.
 *
 * The copy used to keep the template's own title, so Racks Closes opened on a
 * page literally named "Client Template" — the client's workspace wearing the
 * factory label. It takes the client's name, matching the convention The
 * Visionary already uses ("The Visionary Onboarding").
 */
export function onboardingSpaceTitle(clientName: string): string {
  return `${clientName.trim()} Onboarding`;
}

/**
 * Does this teamspace already have its onboarding section?
 *
 * Matches BOTH the old factory title and the client-specific one, so a client
 * seeded before the rename is never given a second copy.
 *
 * This is the question the seeder should have been asking. It used to ask
 * "does this client have ANY page at all", which meant the two clients whose
 * real Notion was imported first (The Grid, The Vault) were treated as already
 * seeded and never got an onboarding section — the exact gap Daniel hit.
 */
export function hasOnboardingSpace(rootTitles: string[], clientName: string): boolean {
  const wanted = onboardingSpaceTitle(clientName).toLowerCase();
  return rootTitles.some((raw) => {
    const title = raw.trim().toLowerCase();
    return title === wanted || title === CLIENT_TEMPLATE_TITLE.toLowerCase();
  });
}

/**
 * The icon on a client's onboarding section.
 *
 * Prefers the CLIENT's own mark over the agency template's, so their space
 * doesn't wear GV's logo — but only when that mark is something the icon
 * renderer can actually draw. Client logos are stored as base64 `data:` URLs,
 * and `isImageIcon` recognises only `http(s)://` and app-relative paths, so
 * handing one straight through would print ~38KB of base64 as the icon's
 * label. When the logo isn't renderable the template's icon stands.
 */
export function onboardingRootIcon(
  clientLogo: string | null,
  templateIcon: string | null,
): string | null {
  return isImageIcon(clientLogo) ? clientLogo : templateIcon;
}
