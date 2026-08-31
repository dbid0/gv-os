/**
 * Colour migrated Notion callouts + red "fill-this-in" markers — purely on the
 * already-parsed BlockNote block array, so there is NO Notion re-crawl and NO
 * database migration. It runs once on load in the editor and the read-only
 * reader, right before the blocks become the editor's content and its autosave
 * baseline.
 *
 * Two passes, both idempotent:
 *
 *   1. Callout background. Notion's coloured callouts were flattened to plain
 *      `> ⚠️ text` blockquotes on import, which BlockNote loads as grey `quote`
 *      blocks. We reinstate the colour from the LEADING emoji (see
 *      {@link CALLOUT_ICON_COLORS}). A top-level `quote` is always a callout
 *      (unknown/absent icon → neutral grey); a top-level `paragraph` is only a
 *      callout when it actually opens with a known icon. A block that already
 *      carries an explicit `backgroundColor` is never touched — a user's own
 *      colour always wins.
 *
 *   2. Red placeholder text. Bracketed fill-in markers like `[INSERT LINK]`,
 *      `[CLIENT NAME]`, or `[X]` were red in Notion. Anywhere in any block's
 *      inline content, each `[...]` run is split out and given
 *      `styles.textColor: "red"`, preserving every other style (bold/italic/…)
 *      on the run. A run that is already explicitly coloured is left alone,
 *      which is what makes re-running a no-op.
 *
 * PURE + idempotent: it never mutates its input and returns a value-stable
 * result, so `colorizeCallouts(colorizeCallouts(x))` deep-equals
 * `colorizeCallouts(x)`.
 */

import type { PartialBlock } from "@blocknote/core";

/** The five BlockNote background colours we map callouts onto. */
export type CalloutColor = "yellow" | "red" | "blue" | "green" | "gray";

/**
 * Leading-emoji → colour table. Small and exported on purpose: to teach a new
 * icon, add it to a row (or add a row). Order does not matter for correctness —
 * every icon is unique across rows — it just documents intent.
 */
export const CALLOUT_ICON_COLORS: ReadonlyArray<{
  color: CalloutColor;
  /** What the colour means, for the reader of this table. */
  meaning: string;
  icons: readonly string[];
}> = [
  { color: "yellow", meaning: "caution", icons: ["⚠️", "🚨"] },
  { color: "red", meaning: "critical", icons: ["🔥"] },
  { color: "blue", meaning: "info", icons: ["💡", "ℹ️", "📣"] },
  { color: "green", meaning: "good", icons: ["✅", "🟢", "🎉"] },
  { color: "red", meaning: "negative", icons: ["❌", "🔴", "🚫", "🔇"] },
  {
    color: "gray",
    meaning: "neutral",
    icons: [
      "📌",
      "📋",
      "📁",
      "📝",
      "🎯",
      "👋",
      "🗂️",
      "📞",
      "☎️",
      "📲",
      "💰",
      "💵",
      "📈",
      "🏆",
    ],
  },
];

/** A callout with no icon, or an icon we do not recognise, reads as neutral. */
const NEUTRAL_FALLBACK: CalloutColor = "gray";

/**
 * U+FE0F / U+FE0E are the emoji / text presentation selectors. Stripping them
 * lets "⚠️" and "⚠" (and "ℹ️"/"ℹ", "☎️"/"☎") match the same table row, so the
 * mapping is robust to however the migration happened to serialise each icon.
 */
const VARIATION_SELECTORS = /[\uFE0E\uFE0F]/g;

function normalizeIcon(value: string): string {
  return value.replace(VARIATION_SELECTORS, "");
}

/** Flat, normalised icon → colour lookup, built once from the table above. */
const ICON_TO_COLOR: ReadonlyMap<string, CalloutColor> = (() => {
  const map = new Map<string, CalloutColor>();
  for (const row of CALLOUT_ICON_COLORS) {
    for (const icon of row.icons) map.set(normalizeIcon(icon), row.color);
  }
  return map;
})();

/** Longest-first so a multi-code-point icon wins over any shorter prefix. */
const KNOWN_ICONS: readonly string[] = [...ICON_TO_COLOR.keys()].sort(
  (a, b) => b.length - a.length,
);

/** The known callout icon a string opens with (variation-selector agnostic). */
function leadingIcon(text: string): string | null {
  const stripped = normalizeIcon(text.replace(/^\s+/, ""));
  for (const icon of KNOWN_ICONS) {
    if (stripped.startsWith(icon)) return icon;
  }
  return null;
}

// --- Minimal structural view of a BlockNote block ---------------------------
// We only touch `type`, `props.backgroundColor`, inline `content`, and
// `children`, so a small structural type keeps this file free of BlockNote's
// large generic block union while staying faithful to the runtime shape.

type StyleMap = Record<string, unknown> & { textColor?: string };

interface TextRun {
  type: "text";
  text: string;
  styles?: StyleMap;
}

interface LinkRun {
  type: "link";
  href: string;
  content: TextRun[];
}

type InlineItem = TextRun | LinkRun | { type: string };

interface EditorBlock {
  type?: string;
  props?: Record<string, unknown> & { backgroundColor?: string };
  content?: InlineItem[] | string | Record<string, unknown>;
  children?: EditorBlock[];
}

/** Matches a `[…]` placeholder marker, e.g. `[INSERT LINK]`, `[X]`. */
const BRACKET_RE = /\[[^\]]+\]/g;

function hasExplicitColor(styles: StyleMap | undefined): boolean {
  return (
    styles !== undefined &&
    typeof styles.textColor === "string" &&
    styles.textColor !== "default"
  );
}

/**
 * Split one text run so every `[…]` marker becomes its own red run and the rest
 * keeps its original styles. An already-coloured run is returned untouched —
 * that respects a user's own colour AND makes a second pass a no-op (our own red
 * markers are skipped).
 */
function splitRunForBrackets(run: TextRun): TextRun[] {
  const styles: StyleMap = run.styles ?? {};
  if (hasExplicitColor(styles)) return [run];

  const { text } = run;
  const out: TextRun[] = [];
  let last = 0;
  for (const match of text.matchAll(BRACKET_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (start > last) {
      out.push({ type: "text", text: text.slice(last, start), styles: { ...styles } });
    }
    out.push({ type: "text", text: match[0], styles: { ...styles, textColor: "red" } });
    last = end;
  }
  if (out.length === 0) return [run];
  if (last < text.length) {
    out.push({ type: "text", text: text.slice(last), styles: { ...styles } });
  }
  return out;
}

/** Bracket-wrap text runs across an inline array, descending into links. */
function processInline(items: InlineItem[]): InlineItem[] {
  const out: InlineItem[] = [];
  for (const item of items) {
    if (item.type === "text") {
      out.push(...splitRunForBrackets(item as TextRun));
    } else if (item.type === "link") {
      const link = item as LinkRun;
      const content = processInline(link.content) as TextRun[];
      out.push({ ...link, content });
    } else {
      out.push(item);
    }
  }
  return out;
}

/** The leading text of a block — the first non-empty text run it opens with. */
function blockLeadingText(content: EditorBlock["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  for (const item of content) {
    if (item.type === "text") {
      const text = (item as TextRun).text;
      if (text.trim() !== "") return text;
      // An empty/whitespace run: keep scanning for the first real text.
    } else {
      // The first substantive inline is not text → no leading emoji.
      break;
    }
  }
  return "";
}

/** The callout colour for a block, or null when the block is not a callout. */
function calloutColorFor(block: EditorBlock): CalloutColor | null {
  const isQuote = block.type === "quote";
  const isParagraph = block.type === "paragraph";
  if (!isQuote && !isParagraph) return null;

  const icon = leadingIcon(blockLeadingText(block.content));

  if (isParagraph) {
    // A paragraph is a callout ONLY when it opens with a known icon.
    return icon ? (ICON_TO_COLOR.get(icon) ?? NEUTRAL_FALLBACK) : null;
  }
  // A quote is always a callout; unknown/absent icon → neutral grey.
  return icon ? (ICON_TO_COLOR.get(icon) ?? NEUTRAL_FALLBACK) : NEUTRAL_FALLBACK;
}

function colorizeBlock(block: EditorBlock, topLevel: boolean): EditorBlock {
  let next: EditorBlock = block;

  // 1) Red placeholder markers — every block, at every depth.
  if (Array.isArray(block.content)) {
    next = { ...next, content: processInline(block.content) };
  }

  // 2) Callout background — top-level quote/paragraph only, and only when there
  //    is no explicit colour yet (a user's own colour is never overwritten).
  if (topLevel) {
    const color = calloutColorFor(next);
    if (color) {
      const existing = next.props?.backgroundColor;
      const alreadyColored =
        typeof existing === "string" && existing !== "" && existing !== "default";
      if (!alreadyColored) {
        next = { ...next, props: { ...next.props, backgroundColor: color } };
      }
    }
  }

  // 3) Recurse into children. Callout colouring never applies below top level;
  //    bracket-wrapping does.
  if (Array.isArray(block.children) && block.children.length > 0) {
    next = { ...next, children: block.children.map((c) => colorizeBlock(c, false)) };
  }

  return next;
}

/**
 * Colour callouts by leading emoji and wrap `[…]` placeholders in red across a
 * BlockNote block array. Pure and idempotent — safe to run on every load.
 *
 * Generic over the block type so it PRESERVES whatever schema the caller passes:
 * the default `PartialBlock[]`, or the Workspace editor's own
 * `WorkspacePartialBlock[]` (which carries the custom `todoDatabase` block). It
 * only ever touches `type`, `props.backgroundColor`, inline `content`, and
 * `children`, so returning the input type is faithful to the runtime shape.
 */
export function colorizeCallouts<T extends PartialBlock | object>(blocks: T[]): T[] {
  const input = blocks as unknown as EditorBlock[];
  const output = input.map((block) => colorizeBlock(block, true));
  return output as unknown as T[];
}
