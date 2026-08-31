/**
 * The teamspace Home — its default, EDITABLE content, built as pure data.
 *
 * When a teamspace's Home page is first created it is seeded with a starter
 * document that mirrors the old fixed dashboard: a "Dashboard" heading over a
 * bulleted list of links to the teamspace's key sections, then a "To-Do List"
 * heading over an embedded interactive To-Do database block. Everything is a
 * normal BlockNote block, so the moment it exists the user can rearrange it, add
 * to it, or delete parts of it — Home is just a page.
 *
 * This module is PURE (no database, no React, no BlockNote import): it shapes the
 * BlockNote document as plain JSON, resolving each dashboard link to a real page
 * id by title against that teamspace's own tree. That is why it can be unit
 * tested exhaustively, and why the server query can call it to seed `content`.
 */

import { findNodeByTitle, type PageNode } from "@/lib/workspace/tree";

/** One row of the "Dashboard" link list — a section title + its leading emoji. */
export interface HomeDashboardItem {
  title: string;
  emoji: string;
}

/**
 * The five sections the Home dashboard links to, in order. Each resolves to a
 * real page by title within the teamspace; an unresolved title still renders as
 * plain text, so a fresh teamspace with no pages yet is never a wall of dead
 * links.
 */
export const HOME_DASHBOARD_ITEMS: HomeDashboardItem[] = [
  { title: "Global Ventures Timeline", emoji: "🗓️" },
  { title: "Onboarding", emoji: "🚀" },
  { title: "Custom GPT's", emoji: "🤖" },
  { title: "Coaching Protocol", emoji: "🎯" },
  { title: "Resources", emoji: "🧰" },
];

/**
 * Resolve a dashboard link title to a `?page=<id>` href within THIS teamspace,
 * or null when no page carries that title. The href is deliberately RELATIVE
 * (`?page=<id>`) so it works from either workspace route — the agency
 * `/clients/workspace` and a client `/clients/<slug>/workspace` — without the
 * seeder needing to know the base path.
 */
export function resolveHomeLinkHref(pages: PageNode[], title: string): string | null {
  const node = findNodeByTitle(pages, title);
  return node ? `?page=${node.id}` : null;
}

/**
 * A minimal BlockNote block shape — enough to seed `content` as JSON that the
 * editor opens as real, editable blocks. Ids and full prop sets are optional in
 * a `PartialBlock`, so this stays a tiny plain object the editor fills in.
 */
export interface HomeSeedBlock {
  type: string;
  props?: Record<string, unknown>;
  content?: unknown[];
}

/** The custom To-Do database block's type name, shared with the editor schema. */
export const TODO_DATABASE_BLOCK_TYPE = "todoDatabase";

/** A plain text run. */
function text(value: string): { type: "text"; text: string; styles: object } {
  return { type: "text", text: value, styles: {} };
}

/** One dashboard bullet: emoji + a link to the resolved page, or plain text. */
function dashboardBullet(item: HomeDashboardItem, href: string | null): HomeSeedBlock {
  if (href) {
    return {
      type: "bulletListItem",
      content: [
        text(`${item.emoji} `),
        { type: "link", href, content: [text(item.title)] },
      ],
    };
  }
  return {
    type: "bulletListItem",
    content: [text(`${item.emoji} ${item.title}`)],
  };
}

/**
 * Build the seed document for a teamspace's Home, resolving each dashboard link
 * against `pages` (that teamspace's page forest). The shape is:
 *
 *   ## Dashboard
 *   - 🗓️ Global Ventures Timeline   (link when the page exists)
 *   - 🚀 Onboarding
 *   - …
 *   ## To-Do List
 *   [todoDatabase]                   (the embedded interactive database)
 *
 * Returned as plain objects; the caller `JSON.stringify`s it into `content`.
 */
export function buildHomeDefaultContent(pages: PageNode[]): HomeSeedBlock[] {
  return [
    { type: "heading", props: { level: 2 }, content: [text("Dashboard")] },
    ...HOME_DASHBOARD_ITEMS.map((item) =>
      dashboardBullet(item, resolveHomeLinkHref(pages, item.title)),
    ),
    { type: "heading", props: { level: 2 }, content: [text("To-Do List")] },
    { type: TODO_DATABASE_BLOCK_TYPE },
  ];
}
