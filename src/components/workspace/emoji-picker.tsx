"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  EMOJI_BY_CATEGORY,
  searchEmoji,
  type EmojiEntry,
} from "@/lib/workspace/emoji-data";
import { cn } from "@/lib/utils";

/**
 * The page-icon picker, built to feel like Notion's: a search field over the FULL
 * emoji set (~1,870 glyphs from `@emoji-mart/data`, already a BlockNote
 * dependency), the results or the browsable catalogue in a scrolling grid with
 * category headings, and a Remove action.
 *
 * The catalogue is rendered lazily — the grid only mounts once the popover is
 * opened — so the page itself never pays for it.
 */
export function EmojiPicker({
  value,
  onSelect,
  size = 56,
}: {
  value: string | null;
  onSelect: (icon: string | null) => void;
  /** Rendered size of the trigger mark, in px. */
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // Land the caret in the search box, the way Notion opens.
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const results = useMemo(() => (query.trim() ? searchEmoji(query) : null), [query]);

  const pick = (icon: string | null) => {
    onSelect(icon);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change page icon"
        className="hover:bg-secondary grid place-items-center rounded-xl transition-colors"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }}
      >
        <span className="leading-none">{value ?? "📄"}</span>
      </button>

      {open && (
        <div className="bg-popover elev-raised gv-pop-in absolute top-full left-0 z-30 mt-2 w-[21rem] rounded-xl border p-2">
          <div className="mb-2 flex items-center gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter takes the first hit, or a pasted glyph as-is.
                if (e.key !== "Enter") return;
                const first = results?.[0]?.native ?? [...query.trim()][0];
                if (first) pick(first);
              }}
              placeholder="Search emoji…"
              aria-label="Search emoji"
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
            />
            <button
              type="button"
              onClick={() => pick(null)}
              className="text-faint hover:text-foreground shrink-0 rounded-md border px-2 py-1 text-xs transition-colors"
            >
              Remove
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto pr-1">
            {results ? (
              results.length === 0 ? (
                <p className="text-faint px-1 py-6 text-center text-xs">
                  No emoji matches “{query.trim()}”.
                </p>
              ) : (
                <Grid emojis={results} value={value} onPick={pick} />
              )
            ) : (
              EMOJI_BY_CATEGORY.map(({ category, emojis }) => (
                <section key={category.id} className="mb-1">
                  <h4 className="text-faint bg-popover sticky top-0 px-1 py-1 text-[0.6875rem] font-medium tracking-wider uppercase">
                    {category.label}
                  </h4>
                  <Grid emojis={emojis} value={value} onPick={pick} />
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** One grid of emoji buttons. */
function Grid({
  emojis,
  value,
  onPick,
}: {
  emojis: EmojiEntry[];
  value: string | null;
  onPick: (icon: string) => void;
}) {
  return (
    <div className="grid grid-cols-9 gap-0.5">
      {emojis.map((e) => (
        <button
          key={`${e.category}-${e.native}`}
          type="button"
          onClick={() => onPick(e.native)}
          title={e.name}
          aria-label={e.name}
          className={cn(
            "hover:bg-secondary grid size-8 place-items-center rounded-md text-lg transition-colors",
            value === e.native && "bg-brand-soft/60 ring-brand/40 ring-1",
          )}
        >
          {e.native}
        </button>
      ))}
    </div>
  );
}
