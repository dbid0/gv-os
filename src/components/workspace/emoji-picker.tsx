"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A small emoji picker for a page icon.
 *
 * Deliberately not a 2,000-emoji grid: a curated set of the icons a working
 * doc actually reaches for, plus a free field to paste any glyph. Clicking the
 * mark opens it; picking one closes it. No dependency, no network.
 */

const EMOJI = [
  "📄",
  "📝",
  "📋",
  "📌",
  "📎",
  "🗂️",
  "📁",
  "📚",
  "📊",
  "📈",
  "📉",
  "🧾",
  "💡",
  "🎯",
  "🚀",
  "⚡",
  "🔥",
  "⭐",
  "✅",
  "☑️",
  "🧠",
  "🛠️",
  "⚙️",
  "🔧",
  "💰",
  "💵",
  "🤝",
  "📣",
  "📢",
  "🗒️",
  "🗓️",
  "⏰",
  "🔍",
  "🔗",
  "🏷️",
  "📦",
  "🎬",
  "🎥",
  "✍️",
  "🖊️",
  "🧭",
  "🧩",
  "🏆",
  "🥇",
  "💎",
  "🌐",
  "🏗️",
  "🧱",
];

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
  const [custom, setCustom] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

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
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (icon: string | null) => {
    onSelect(icon);
    setCustom("");
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
        <div className="bg-popover elev-raised gv-pop-in absolute top-full left-0 z-30 mt-2 w-72 rounded-xl border p-3">
          <div className="mb-2 flex items-center gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim()) pick([...custom.trim()][0]);
              }}
              placeholder="Paste an emoji…"
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
            />
            <button
              type="button"
              onClick={() => pick(null)}
              className="text-faint hover:text-foreground shrink-0 rounded-md border px-2 py-1 text-xs transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => pick(emoji)}
                className={cn(
                  "hover:bg-secondary grid size-8 place-items-center rounded-md text-lg transition-colors",
                  value === emoji && "bg-brand-soft/60 ring-brand/40 ring-1",
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
