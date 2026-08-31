/**
 * Workspace link helpers — PURE, so the editor's click handler and the To-Do
 * database resolve internal page links off the exact same logic the tests pin.
 * No DOM, no React, no database here — just string reasoning about hrefs and
 * task text, which is why it can be unit-tested exhaustively.
 */

/**
 * If `href` points at a page WITHIN the current workspace route — the relative
 * `?page=<id>` the seeder and "Copy link" write, or an absolute URL to the same
 * base path — return that page id. Otherwise (a bare fragment, a non-http
 * scheme, another route, or a link with no `page` param) return null, so the
 * caller treats it as a normal outbound link that opens in a new tab.
 *
 * `basePath` is the current workspace route (e.g. `/clients/foo/workspace`),
 * i.e. `usePathname()`. Matching is on the PATH + `?page=` only, never the
 * origin, so it works in the browser and under test without a real location; the
 * browser caller enforces same-origin before trusting an absolute URL.
 */
export function isInternalPageHref(
  href: string | null | undefined,
  basePath: string,
): string | null {
  if (!href) return null;
  const raw = href.trim();
  if (raw === "" || raw.startsWith("#")) return null;
  if (/^(mailto:|tel:|javascript:|data:)/i.test(raw)) return null;

  let pathname: string;
  let search: string;
  try {
    // Resolve against a throwaway origin so relative and absolute hrefs both
    // parse: a same-path relative `?page=` keeps the base path, while an
    // absolute URL brings its own path (which must equal the base path below).
    const safeBase = basePath.startsWith("/") ? basePath : `/${basePath}`;
    const url = new URL(raw, `http://internal.local${safeBase}`);
    pathname = url.pathname;
    search = url.search;
  } catch {
    return null;
  }

  const strip = (p: string) => p.replace(/\/+$/, "") || "/";
  if (strip(pathname) !== strip(basePath)) return null;

  const id = new URLSearchParams(search).get("page");
  return id && id.trim() !== "" ? id.trim() : null;
}

/**
 * If `href` is a same-origin APP ROUTE (a path within this deployment that is
 * NOT the `?page=` page-link form) return the path+query to hand to
 * `router.push`, else null. This is what keeps a link like `/marketing` — the
 * Content section links on Home, which live outside the workspace page tree — an
 * IN-APP client-side navigation rather than a new browser tab.
 *
 * "Same-origin" is decided by resolving `href` against a throwaway origin: a
 * relative href (or an absolute one that happens to match that origin) keeps it,
 * while a genuinely external absolute URL brings a different origin and is
 * rejected. Fragments and non-http schemes (`#`, `mailto:`, `tel:`, …) are never
 * routes. The `?page=` page-link form is intentionally NOT excluded here — the
 * classifier below checks {@link isInternalPageHref} first, so page links never
 * reach this function in practice.
 */
export function internalRouteHref(
  href: string | null | undefined,
  basePath: string,
): string | null {
  if (!href) return null;
  const raw = href.trim();
  if (raw === "" || raw.startsWith("#")) return null;
  if (/^(mailto:|tel:|javascript:|data:)/i.test(raw)) return null;

  let url: URL;
  try {
    const safeBase = basePath.startsWith("/") ? basePath : `/${basePath}`;
    url = new URL(raw, `http://internal.local${safeBase}`);
  } catch {
    return null;
  }
  // A different origin means a genuinely external, off-site URL — a new tab.
  if (url.origin !== "http://internal.local") return null;
  return `${url.pathname}${url.search}`;
}

/** How a clicked workspace link should be handled — the single source of truth. */
export type WorkspaceLinkAction =
  | { kind: "page"; pageId: string }
  | { kind: "route"; href: string }
  | { kind: "external" };

/**
 * Classify a link's `href` into the ONE way it should navigate, so the editor's
 * click handler (and its tests) share the exact same reasoning:
 *
 *   • "page"     — an internal `?page=<id>` link → switch pages in-app (no nav).
 *   • "route"    — any other same-origin app path (e.g. `/marketing`) →
 *                  `router.push` in-app, NOT a new tab.
 *   • "external" — a genuinely off-site URL → open in a new tab.
 *
 * Page links win over route links (a `?page=` on the base path is a page, never a
 * route), which is why {@link isInternalPageHref} is checked first.
 */
export function classifyWorkspaceLink(
  href: string | null | undefined,
  basePath: string,
): WorkspaceLinkAction {
  const pageId = isInternalPageHref(href, basePath);
  if (pageId) return { kind: "page", pageId };
  const route = internalRouteHref(href, basePath);
  if (route) return { kind: "route", href: route };
  return { kind: "external" };
}

/**
 * The teamspace "sheet" pages a To-Do task can deep-link to by name — the
 * onboarding sheets a task like "Fill out Software Logins" refers to. When a
 * task's text contains one of these titles AND it resolves to a real page in the
 * teamspace, that span renders as a link that opens the page (Notion-style);
 * otherwise the task stays plain text.
 */
export const SHEET_LINK_TITLES = [
  "Software Logins",
  "Brand Sheets",
  "Client Roadmap",
] as const;

/** A task split around the first sheet-title span that resolves to a real page. */
export interface LinkifiedTask {
  before: string;
  /** The matched span (kept in the task's own casing) + the page it opens. */
  link: { text: string; pageId: string };
  after: string;
}

/**
 * Find the earliest known sheet title inside `task` that `resolvePageId` maps to
 * a real page, and split the task around it. Case-INSENSITIVE on the title, but
 * `link.text` keeps the task's own casing so the row reads exactly as typed.
 * Returns null when no known title appears, or the ones that do have no page —
 * the caller then renders the task as plain, un-linked text.
 */
export function linkifyTaskText(
  task: string,
  resolvePageId: (title: string) => string | null,
  titles: readonly string[] = SHEET_LINK_TITLES,
): LinkifiedTask | null {
  const lower = task.toLowerCase();
  let best: { index: number; length: number; pageId: string } | null = null;
  for (const title of titles) {
    const idx = lower.indexOf(title.toLowerCase());
    if (idx < 0) continue;
    // Keep the earliest match that actually resolves to a page.
    if (best !== null && idx >= best.index) continue;
    const pageId = resolvePageId(title);
    if (!pageId) continue;
    best = { index: idx, length: title.length, pageId };
  }
  if (!best) return null;
  return {
    before: task.slice(0, best.index),
    link: {
      text: task.slice(best.index, best.index + best.length),
      pageId: best.pageId,
    },
    after: task.slice(best.index + best.length),
  };
}
