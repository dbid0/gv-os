import { isInternalPageHref } from "@/lib/workspace/links";

/**
 * Making an internal `?page=` link behave like a Notion PAGE MENTION: it shows
 * the target page's CURRENT icon and title, wherever it is linked from.
 *
 * Before this, a link's label and its emoji were frozen text written at seed or
 * import time. Renaming a page, or giving it a new icon, left every link to it
 * showing the old one — which is why changing an icon appeared to "not work" on
 * sub-page links. Notion has no such drift: the mention renders from the page.
 *
 * The fix is applied when a document is LOADED into the editor, so a mention is
 * always correct as of opening the page, and the emoji lives INSIDE the link (a
 * single mention) rather than beside it as loose text.
 *
 * Pure and defensive: unknown blocks, missing content, external links, and links
 * whose target no longer exists are all left exactly as they were.
 */

/** What a mention renders: the page's live label. Null = not a known page. */
export type DescribePage = (
  pageId: string,
) => { title: string; icon: string | null } | null;

/** A loose emoji (+ trailing space) that used to sit BEFORE the link. */
const LEADING_EMOJI = /^\s*\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*\s*$/u;

type Inline = Record<string, unknown>;
type Block = Record<string, unknown>;

function isLink(item: unknown): item is Inline & { href: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    (item as Inline).type === "link" &&
    typeof (item as Inline).href === "string"
  );
}

/** The single text run a mention's label becomes. */
function label(page: { title: string; icon: string | null }): Inline {
  const text = page.icon ? `${page.icon} ${page.title}` : page.title;
  return { type: "text", text, styles: {} };
}

/**
 * Rewrite one inline array: every internal page link gets the live label, and a
 * loose emoji run immediately before it is absorbed into the mention so the icon
 * is not shown twice.
 */
function enrichInline(
  content: unknown[],
  basePath: string,
  describe: DescribePage,
): unknown[] {
  const out: unknown[] = [];
  for (const item of content) {
    if (!isLink(item)) {
      out.push(item);
      continue;
    }
    const pageId = isInternalPageHref(item.href, basePath);
    const page = pageId ? describe(pageId) : null;
    if (!page) {
      out.push(item);
      continue;
    }
    // Absorb a loose emoji that was sitting just before this link.
    const prev = out[out.length - 1] as Inline | undefined;
    if (
      prev &&
      prev.type === "text" &&
      typeof prev.text === "string" &&
      LEADING_EMOJI.test(prev.text)
    ) {
      out.pop();
    }
    out.push({ ...item, content: [label(page)] });
  }
  return out;
}

/**
 * Walk a BlockNote document and give every internal page link its target's live
 * icon + title. Returns a new tree; the input is never mutated.
 */
export function enrichPageMentions<T>(
  blocks: T[],
  basePath: string,
  describe: DescribePage,
): T[] {
  const walk = (block: Block): Block => {
    const next: Block = { ...block };
    if (Array.isArray(next.content)) {
      next.content = enrichInline(next.content, basePath, describe);
    }
    if (Array.isArray(next.children)) {
      next.children = (next.children as Block[]).map(walk);
    }
    return next;
  };
  return blocks.map((b) => walk(b as Block) as unknown as T);
}
