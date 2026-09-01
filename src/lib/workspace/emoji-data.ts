/**
 * The emoji catalogue behind the page-icon picker.
 *
 * Built from `@emoji-mart/data` — the full Unicode set (~1,870 emoji with search
 * keywords), already present as a BlockNote dependency, so this costs no new
 * package. This module reshapes it into the flat, category-ordered list the
 * picker renders and searches, and is PURE (no React, no DOM) so the search can
 * be unit-tested directly.
 */

import rawData from "@emoji-mart/data";

/** One emoji: the glyph plus the words that should find it. */
export interface EmojiEntry {
  /** The glyph itself, e.g. "🚀". */
  native: string;
  /** Human name, e.g. "Rocket". */
  name: string;
  /** Lower-cased search terms (id + name words + keywords). */
  terms: string[];
  /** The category id it belongs to. */
  category: string;
}

/** A category, in the order Notion shows them. */
export interface EmojiCategory {
  id: string;
  label: string;
}

/**
 * A page icon is either an emoji glyph or an UPLOADED IMAGE, in which case the
 * stored value is that image's URL (absolute, or app-relative). Everywhere an
 * icon is drawn asks this first, so a custom icon — the GV logo, a client's
 * mark — renders as a picture instead of the literal URL text.
 */
export function isImageIcon(icon: string | null | undefined): boolean {
  if (!icon) return false;
  const v = icon.trim();
  return /^https?:\/\//i.test(v) || v.startsWith("/");
}

/** Category ids in `@emoji-mart/data`, with the labels we display. */
export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { id: "people", label: "Smileys & People" },
  { id: "nature", label: "Animals & Nature" },
  { id: "foods", label: "Food & Drink" },
  { id: "activity", label: "Activity" },
  { id: "places", label: "Travel & Places" },
  { id: "objects", label: "Objects" },
  { id: "symbols", label: "Symbols" },
  { id: "flags", label: "Flags" },
];

// --- the raw file's shape, narrowed to what we read ------------------------
interface RawEmoji {
  id: string;
  name: string;
  keywords?: string[];
  skins: { native?: string }[];
}
interface RawData {
  categories: { id: string; emojis: string[] }[];
  emojis: Record<string, RawEmoji>;
}

const data = rawData as unknown as RawData;

/**
 * Every emoji, grouped in category order. Built once at module load: the
 * category list drives the order, so the grid reads the way a picker should
 * (smileys first, flags last) rather than in object-key order.
 */
export const EMOJI_BY_CATEGORY: { category: EmojiCategory; emojis: EmojiEntry[] }[] =
  EMOJI_CATEGORIES.map((category) => {
    const ids = data.categories.find((c) => c.id === category.id)?.emojis ?? [];
    const emojis: EmojiEntry[] = [];
    for (const id of ids) {
      const raw = data.emojis[id];
      const native = raw?.skins?.[0]?.native;
      if (!raw || !native) continue;
      const terms = new Set<string>([
        id.toLowerCase(),
        ...raw.name.toLowerCase().split(/\s+/),
      ]);
      for (const kw of raw.keywords ?? []) terms.add(kw.toLowerCase());
      emojis.push({ native, name: raw.name, terms: [...terms], category: category.id });
    }
    return { category, emojis };
  });

/** The flat catalogue, in the same category order. */
export const ALL_EMOJI: EmojiEntry[] = EMOJI_BY_CATEGORY.flatMap((g) => g.emojis);

/**
 * Search the catalogue. Matching is case-insensitive and PREFIX-based on each
 * term, so "roc" finds "rocket" while "ket" does not — the behaviour people
 * expect while typing. An empty query returns nothing (the caller shows the
 * browsable grid instead); results are capped so the grid stays light.
 */
export function searchEmoji(query: string, limit = 120): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: EmojiEntry[] = [];
  const contains: EmojiEntry[] = [];
  for (const e of ALL_EMOJI) {
    // An exact glyph paste finds itself.
    if (e.native === query.trim()) return [e];
    let hit: "start" | "part" | null = null;
    for (const term of e.terms) {
      if (term.startsWith(q)) {
        hit = "start";
        break;
      }
      if (hit === null && term.includes(q)) hit = "part";
    }
    if (hit === "start") starts.push(e);
    else if (hit === "part") contains.push(e);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
