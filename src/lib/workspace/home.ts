/**
 * The teamspace Home — its default, EDITABLE content, built as pure data.
 *
 * The seed mirrors Daniel's real Notion "Global Ventures Onboarding" home: a
 * TWO-COLUMN layout. The LEFT column holds two boxed callout sections — a
 * "⚡ Dashboard" box of links to the teamspace's key pages, and a "🎥 Content"
 * box of links into the Marketing section — and the RIGHT column holds a
 * "To-Do List" box wrapping the embedded interactive To-Do database. Every part
 * is a normal BlockNote block (columns come from the official multi-column
 * schema, boxes from `quote` blocks tinted grey like our Notion callouts), so
 * the instant Home exists the user can rearrange, add to, or delete any of it —
 * Home is just a page.
 *
 * This module is PURE (no database, no React, no BlockNote import): it shapes the
 * BlockNote document as plain JSON, resolving each dashboard link to a real page
 * id by title against that teamspace's own tree. That is why it can be unit
 * tested exhaustively, and why the server query can call it to seed `content`.
 */

import { findNodeByTitle, type PageNode } from "@/lib/workspace/tree";

/** One row of a link list — a section title + its leading emoji. */
export interface HomeDashboardItem {
  title: string;
  emoji: string;
}

/**
 * The LEFT-column "Dashboard" links, in order. Each resolves to a real page by
 * title within the teamspace; an unresolved title still renders as plain text,
 * so a fresh teamspace with no pages yet is never a wall of dead links.
 */
export const HOME_DASHBOARD_ITEMS: HomeDashboardItem[] = [
  { title: "Global Ventures Timeline", emoji: "🗓️" },
  { title: "Onboarding", emoji: "🚀" },
  { title: "Custom GPT's", emoji: "🤖" },
  { title: "Coaching Protocol", emoji: "🎯" },
  { title: "SOP Database", emoji: "🗄️" },
  { title: "Resources", emoji: "🧰" },
];

/**
 * The LEFT-column "Content" links, in order. These point at pages that live in
 * the Marketing SECTION, not the workspace page tree, so they never resolve to a
 * `?page=` link — they all navigate IN-APP to {@link MARKETING_ROUTE_HREF} (the
 * editor's click handler `router.push`es a same-origin app route rather than
 * opening a new tab).
 */
export const HOME_CONTENT_ITEMS: HomeDashboardItem[] = [
  { title: "Assets", emoji: "🎬" },
  { title: "YouTube", emoji: "▶️" },
  { title: "Instagram Reels", emoji: "📱" },
  { title: "Instagram Stories", emoji: "📸" },
  { title: "Ads", emoji: "📢" },
];

/**
 * The in-app route the Content links navigate to. A same-origin app path (not a
 * `?page=` page link), so the click handler classifies it as a "route" and
 * `router.push`es it in-app — never a new browser tab.
 */
export const MARKETING_ROUTE_HREF = "/marketing";

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
  children?: HomeSeedBlock[];
}

/** The custom To-Do database block's type name, shared with the editor schema. */
export const TODO_DATABASE_BLOCK_TYPE = "todoDatabase";

/** The multi-column container + column block type names (official BlockNote xl). */
export const COLUMN_LIST_BLOCK_TYPE = "columnList";
export const COLUMN_BLOCK_TYPE = "column";

/** The subtle grey that gives every section its Notion-callout "box" look. */
const BOX_BACKGROUND = "gray";

/** A plain (or styled) text run. */
function text(
  value: string,
  styles: Record<string, unknown> = {},
): { type: "text"; text: string; styles: Record<string, unknown> } {
  return { type: "text", text: value, styles };
}

/** One link list item: emoji + a link to `href`, or plain text when unresolved. */
function linkBullet(item: HomeDashboardItem, href: string | null): HomeSeedBlock {
  const base: HomeSeedBlock = { type: "bulletListItem", props: {} };
  if (href) {
    return {
      ...base,
      content: [
        text(`${item.emoji} `),
        { type: "link", href, content: [text(item.title)] } as unknown,
      ],
    };
  }
  return { ...base, content: [text(`${item.emoji} ${item.title}`)] };
}

/**
 * A boxed section: a grey `quote` header (bold emoji + title, our Notion-callout
 * look) with its link bullets nested INSIDE as children, so the whole thing
 * reads as one rounded, subtly-outlined box.
 */
function boxSection(
  emoji: string,
  title: string,
  bullets: HomeSeedBlock[],
): HomeSeedBlock {
  return {
    type: "quote",
    props: { backgroundColor: BOX_BACKGROUND },
    content: [text(`${emoji} ${title}`, { bold: true })],
    children: bullets,
  };
}

/** The LEFT column: the Dashboard box over the Content box. */
function leftColumn(pages: PageNode[]): HomeSeedBlock {
  const dashboard = boxSection(
    "⚡",
    "Dashboard",
    HOME_DASHBOARD_ITEMS.map((item) =>
      linkBullet(item, resolveHomeLinkHref(pages, item.title)),
    ),
  );
  const content = boxSection(
    "🎥",
    "Content",
    HOME_CONTENT_ITEMS.map((item) => linkBullet(item, MARKETING_ROUTE_HREF)),
  );
  return {
    type: COLUMN_BLOCK_TYPE,
    props: { width: 1 },
    children: [dashboard, content],
  };
}

/**
 * The RIGHT column: a "To-Do List" box header over the interactive To-Do
 * database. The header is the SAME grey bold `quote` callout the Dashboard and
 * Content boxes use (not a coloured `heading`, which rendered a white stripe
 * behind faint text), so all three section headers read identically.
 */
function rightColumn(): HomeSeedBlock {
  return {
    type: COLUMN_BLOCK_TYPE,
    props: { width: 1 },
    children: [
      {
        type: "quote",
        props: { backgroundColor: BOX_BACKGROUND },
        content: [text("📋 To-Do List", { bold: true })],
      },
      { type: TODO_DATABASE_BLOCK_TYPE, props: {} },
    ],
  };
}

/**
 * Build the seed document for a teamspace's Home, resolving each dashboard link
 * against `pages` (that teamspace's page forest). The shape is a single
 * `columnList` with two columns:
 *
 *   columnList
 *   ├── column (left)
 *   │   ├── quote "⚡ Dashboard"   → Timeline · Onboarding · Custom GPT's ·
 *   │   │                            Coaching Protocol · SOP Database · Resources
 *   │   └── quote "🎥 Content"     → Assets · YouTube · Reels · Stories · Ads
 *   └── column (right)
 *       ├── heading "📋 To-Do List"
 *       └── todoDatabase           (the embedded interactive database)
 *
 * Returned as plain objects; the caller `JSON.stringify`s it into `content`.
 */
export function buildHomeDefaultContent(pages: PageNode[]): HomeSeedBlock[] {
  return [
    {
      type: COLUMN_LIST_BLOCK_TYPE,
      props: {},
      children: [leftColumn(pages), rightColumn()],
    },
  ];
}

// --- Legacy single-column seed, kept ONLY to recognise (and re-seed) it -------
// The pre-two-column Home was a flat "Dashboard" heading + link bullets + a
// "To-Do List" heading + the todoDatabase block. We keep just enough of its
// shape to detect an UNTOUCHED old default so it can be upgraded in place; an
// edited home never matches this and is left exactly as the user left it.

/** The five titles the legacy Dashboard linked to (before "SOP Database"). */
const LEGACY_DASHBOARD_TITLES = [
  "Global Ventures Timeline",
  "Onboarding",
  "Custom GPT's",
  "Coaching Protocol",
  "Resources",
] as const;

/** The plain leading text of a legacy seed block's inline content. */
function leadingBlockText(block: unknown): string {
  if (!block || typeof block !== "object") return "";
  const content = (block as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const run of content) {
    if (run && typeof run === "object") {
      const node = run as { text?: unknown; content?: { text?: unknown }[] };
      if (typeof node.text === "string") out += node.text;
      else if (Array.isArray(node.content)) {
        out += node.content
          .map((n) => (typeof n.text === "string" ? n.text : ""))
          .join("");
      }
    }
  }
  return out;
}

/**
 * True only for an UNTOUCHED legacy (single-column) Home seed: exactly a
 * "Dashboard" heading, one bullet per legacy title (in order), a "To-Do List"
 * heading, then the todoDatabase block — with NO `columnList` anywhere. Ignores
 * resolved hrefs and any ids, so it matches regardless of which links resolved,
 * yet the moment a user edits the page (adds/removes/reorders a block or changes
 * the wording) it stops matching and the home is left alone. Pure: it takes the
 * stored `content` JSON string and never touches the database.
 */
export function isLegacyHomeSeed(content: string | null | undefined): boolean {
  if (!content) return false;
  let blocks: unknown;
  try {
    blocks = JSON.parse(content);
  } catch {
    return false;
  }
  if (!Array.isArray(blocks)) return false;
  // The new layout is a single columnList — never a legacy seed.
  if (blocks.some((b) => (b as { type?: string })?.type === COLUMN_LIST_BLOCK_TYPE)) {
    return false;
  }

  const expectedLength = 2 + LEGACY_DASHBOARD_TITLES.length + 1;
  if (blocks.length !== expectedLength) return false;

  const typeOf = (b: unknown) => (b as { type?: string })?.type;
  const norm = (s: string) => s.trim().toLowerCase();

  if (typeOf(blocks[0]) !== "heading") return false;
  if (norm(leadingBlockText(blocks[0])) !== "dashboard") return false;

  for (let i = 0; i < LEGACY_DASHBOARD_TITLES.length; i++) {
    const bullet = blocks[1 + i];
    if (typeOf(bullet) !== "bulletListItem") return false;
    if (!norm(leadingBlockText(bullet)).includes(norm(LEGACY_DASHBOARD_TITLES[i]))) {
      return false;
    }
  }

  const todoHeading = blocks[1 + LEGACY_DASHBOARD_TITLES.length];
  if (typeOf(todoHeading) !== "heading") return false;
  if (norm(leadingBlockText(todoHeading)) !== "to-do list") return false;

  const last = blocks[blocks.length - 1];
  return typeOf(last) === TODO_DATABASE_BLOCK_TYPE;
}
