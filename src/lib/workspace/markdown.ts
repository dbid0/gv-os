/**
 * A small, safe markdown parser — pure, so the renderer never has to reach for
 * a dependency or `dangerouslySetInnerHTML`.
 *
 * It parses to a typed token tree; a React component turns that tree into
 * elements, which means every scrap of user text is escaped by React and no
 * raw HTML is ever injected. Links are sanitised here too. It covers the Notion
 * basics — headings, bold/italic/strike, inline code, links, coloured text,
 * bullet + numbered + checkbox lists, quotes, callouts, toggles, fenced code,
 * and dividers — and nothing it does not understand is dropped: unknown markup
 * falls through as plain text.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "strike"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "color"; color: string; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type ListItem = {
  /** bullet · ordered · check — the marker this row draws. */
  marker: "bullet" | "ordered" | "check";
  /** For an ordered row, the number it showed. */
  number?: number;
  /** For a checkbox row, whether it was ticked. */
  checked?: boolean;
  /** Nesting depth (2 leading spaces == one level), capped for sanity. */
  depth: number;
  inline: Inline[];
};

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; inline: Inline[] }
  | { type: "paragraph"; inline: Inline[] }
  | { type: "list"; items: ListItem[] }
  | { type: "quote"; lines: Inline[][] }
  | { type: "callout"; emoji: string; lines: Inline[][] }
  | { type: "toggle"; summary: Inline[]; blocks: Block[] }
  | { type: "code"; lang: string | null; code: string }
  | { type: "divider" };

/**
 * The named text colours Notion offers, and their dark-mode hex. Only these
 * names resolve; anything else falls through as plain text, so the `[x]{color}`
 * syntax can never inject arbitrary CSS.
 */
export const NOTION_TEXT_COLORS: Record<string, string> = {
  gray: "#9b9b9b",
  brown: "#ba856f",
  orange: "#ffa344",
  yellow: "#ffdc49",
  green: "#4dab9a",
  blue: "#529cca",
  purple: "#9a6dd7",
  pink: "#e255a1",
  red: "#ff7369",
};

/**
 * Only let through schemes that cannot execute script. Everything else — most
 * importantly `javascript:` — collapses to a dead anchor, so a pasted link can
 * never become an XSS vector.
 */
export function sanitizeHref(raw: string): string {
  const href = raw.trim();
  if (href === "") return "#";
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (href.startsWith("/") || href.startsWith("#") || href.startsWith("./")) {
    return href;
  }
  // A bare "example.com/x" is a common paste — treat it as https, not a scheme.
  if (!href.includes(":")) return href;
  return "#";
}

function matchLink(
  text: string,
  start: number,
): { label: string; href: string; end: number } | null {
  const close = text.indexOf("]", start + 1);
  if (close === -1 || text[close + 1] !== "(") return null;
  const paren = text.indexOf(")", close + 2);
  if (paren === -1) return null;
  return {
    label: text.slice(start + 1, close),
    href: text.slice(close + 2, paren),
    end: paren + 1,
  };
}

/** `[label]{color}` — a coloured span. Only known colour names match. */
function matchColor(
  text: string,
  start: number,
): { label: string; color: string; end: number } | null {
  const close = text.indexOf("]", start + 1);
  if (close === -1 || text[close + 1] !== "{") return null;
  const brace = text.indexOf("}", close + 2);
  if (brace === -1) return null;
  const color = text
    .slice(close + 2, brace)
    .trim()
    .toLowerCase();
  if (!(color in NOTION_TEXT_COLORS)) return null;
  return { label: text.slice(start + 1, close), color, end: brace + 1 };
}

/** Find the closing marker, skipping matches that are part of a doubled marker. */
function findClose(text: string, from: number, marker: string): number {
  if (marker.length === 2) return text.indexOf(marker, from);
  for (let j = from; j < text.length; j++) {
    if (text[j] === marker && text[j - 1] !== marker && text[j + 1] !== marker) {
      return j;
    }
  }
  return -1;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ type: "text", value: buf });
    buf = "";
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];

    if (c === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push({ type: "code", value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (c === "[") {
      const link = matchLink(text, i);
      if (link) {
        flush();
        out.push({
          type: "link",
          href: sanitizeHref(link.href),
          children: parseInline(link.label),
        });
        i = link.end;
        continue;
      }
      const colored = matchColor(text, i);
      if (colored) {
        flush();
        out.push({
          type: "color",
          color: colored.color,
          children: parseInline(colored.label),
        });
        i = colored.end;
        continue;
      }
    }

    if ((c === "*" && text[i + 1] === "*") || (c === "_" && text[i + 1] === "_")) {
      const marker = text.slice(i, i + 2);
      const end = findClose(text, i + 2, marker);
      if (end !== -1) {
        flush();
        out.push({ type: "strong", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (c === "~" && text[i + 1] === "~") {
      const end = findClose(text, i + 2, "~~");
      if (end !== -1) {
        flush();
        out.push({ type: "strike", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (c === "*" || c === "_") {
      const end = findClose(text, i + 1, c);
      if (end !== -1) {
        flush();
        out.push({ type: "em", children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    buf += c;
    i++;
  }

  flush();
  return out;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const DIVIDER = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const CHECK = /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/;
const BULLET = /^(\s*)[-*]\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)\.\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TOGGLE = /^(\s*)\+\s+(.*)$/;
const CALLOUT_TAG = /^\[!([^\]]+)\]\s?(.*)$/;

/** Named callout tags map to an emoji; a bare emoji tag is used as-is. */
const CALLOUT_EMOJI: Record<string, string> = {
  note: "📝",
  info: "ℹ️",
  tip: "💡",
  idea: "💡",
  warning: "⚠️",
  caution: "⚠️",
  danger: "🚨",
  important: "🚨",
  success: "✅",
  done: "✅",
  question: "❓",
  quote: "💬",
};

function calloutEmojiFor(tag: string): string {
  const key = tag.trim().toLowerCase();
  if (key in CALLOUT_EMOJI) return CALLOUT_EMOJI[key];
  // A non-alphabetic tag is treated as a literal emoji: `[!💡]`.
  if (/^[a-z]+$/i.test(tag.trim())) return "💡";
  return tag.trim();
}

const MAX_DEPTH = 6;
const depthOf = (indent: string) => Math.min(Math.floor(indent.length / 2), MAX_DEPTH);

function listItemOf(line: string): ListItem | null {
  const check = CHECK.exec(line);
  if (check) {
    return {
      marker: "check",
      checked: check[2].toLowerCase() === "x",
      depth: depthOf(check[1]),
      inline: parseInline(check[3]),
    };
  }
  const ordered = ORDERED.exec(line);
  if (ordered) {
    return {
      marker: "ordered",
      number: Number(ordered[2]),
      depth: depthOf(ordered[1]),
      inline: parseInline(ordered[3]),
    };
  }
  const bullet = BULLET.exec(line);
  if (bullet) {
    return {
      marker: "bullet",
      depth: depthOf(bullet[1]),
      inline: parseInline(bullet[2]),
    };
  }
  return null;
}

/** A run of quote lines is a callout when its first line opens with `[!tag]`. */
function calloutOf(raw: string[]): Block | null {
  const head = CALLOUT_TAG.exec(raw[0] ?? "");
  if (!head) return null;
  const emoji = calloutEmojiFor(head[1]);
  const body = [head[2], ...raw.slice(1)];
  if (body.length > 1 && body[0].trim() === "") body.shift();
  return { type: "callout", emoji, lines: body.map((l) => parseInline(l)) };
}

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code — everything until the closing fence, verbatim.
    const fence = /^\s*```(.*)$/.exec(line);
    if (fence) {
      const lang = fence[1].trim() || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume the closing fence (or run off the end)
      blocks.push({ type: "code", lang, code: body.join("\n") });
      continue;
    }

    if (DIVIDER.test(line)) {
      blocks.push({ type: "divider" });
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        inline: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    // Toggle — `+ summary`, then its more-indented lines are the body, parsed
    // recursively so a toggle can hold lists, callouts, or nested toggles.
    const toggle = TOGGLE.exec(line);
    if (toggle) {
      const indent = toggle[1].length;
      const summary = parseInline(toggle[2]);
      i++;
      const bodyLines: string[] = [];
      const strip = new RegExp(`^ {0,${indent + 2}}`);
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === "") break;
        const lead = /^\s*/.exec(l)![0].length;
        if (lead <= indent) break;
        bodyLines.push(l.replace(strip, ""));
        i++;
      }
      blocks.push({
        type: "toggle",
        summary,
        blocks: parseBlocks(bodyLines.join("\n")),
      });
      continue;
    }

    if (QUOTE.test(line)) {
      const raw: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        raw.push(QUOTE.exec(lines[i])![1]);
        i++;
      }
      const callout = calloutOf(raw);
      if (callout) {
        blocks.push(callout);
        continue;
      }
      blocks.push({ type: "quote", lines: raw.map((l) => parseInline(l)) });
      continue;
    }

    if (listItemOf(line)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const item = listItemOf(lines[i]);
        if (!item) break;
        items.push(item);
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    // Paragraph — consecutive plain lines, soft-joined with a space.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (
        l.trim() === "" ||
        /^\s*```/.test(l) ||
        DIVIDER.test(l) ||
        HEADING.test(l) ||
        TOGGLE.test(l) ||
        QUOTE.test(l) ||
        listItemOf(l)
      ) {
        break;
      }
      para.push(l.trim());
      i++;
    }
    blocks.push({ type: "paragraph", inline: parseInline(para.join(" ")) });
  }

  return blocks;
}
