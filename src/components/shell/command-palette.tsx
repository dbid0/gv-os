"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { allNavItems } from "@/components/shell/nav-config";
import { snappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * ⌘K.
 *
 * Hand-built rather than pulled from a library, because the motion is the point
 * and a dependency would fight us on it. Roughly 150 lines and fully ours.
 *
 * Behaviour that makes it feel right:
 * - The panel scales up from 98% while the backdrop fades. Scaling from very
 *   small reads as a cartoon; 2% reads as the panel arriving.
 * - Arrow keys move a highlight that follows via a shared layoutId, so it
 *   glides between results instead of blinking.
 * - The mouse and the keyboard control the same highlight, so hovering does not
 *   fight the arrow keys.
 * - Escape closes, Enter navigates, and focus returns where it came from.
 */
export function CommandPalette() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  // Query and highlight live in ONE state object. Typing must reset the
  // highlight to the first result, and keeping them together does that in a
  // single update rather than an effect that fires a second render.
  const [{ query, index }, setSearch] = useState({ query: "", index: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  const setQuery = (value: string) => setSearch({ query: value, index: 0 });
  const setIndex = (next: (i: number) => number) =>
    setSearch((s) => ({ ...s, index: next(s.index) }));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = allNavItems.filter((item) => item.status === "ready");
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q),
    );
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setSearch({ query: "", index: 0 });
    restoreFocusTo.current?.focus();
  }, []);

  // ⌘K / Ctrl+K anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        restoreFocusTo.current = document.activeElement as HTMLElement;
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((i) => (results.length ? (i + 1) % results.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === "Enter" && results[index]) {
      event.preventDefault();
      const href = results[index].href;
      close();
      router.push(href);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[18vh]"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onKeyDown={onKeyDown}
        >
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={close}
            aria-hidden
          />

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={reduceMotion ? { duration: 0 } : snappy}
            className="bg-popover elev-raised relative w-full max-w-xl overflow-hidden rounded-xl border"
          >
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="text-faint size-4 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search GV OS..."
                aria-label="Search"
                // The real combobox pattern: the input keeps focus while the
                // highlight moves, and activedescendant tells a screen reader
                // which option is current.
                role="combobox"
                aria-expanded
                aria-controls="command-results"
                aria-activedescendant={
                  results[index] ? `command-option-${index}` : undefined
                }
                className="placeholder:text-faint h-12 w-full bg-transparent text-sm outline-none"
              />
              <kbd className="border-border-strong text-faint hidden rounded border px-1.5 py-0.5 text-[10px] sm:block">
                ESC
              </kbd>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="text-muted-foreground px-3 py-8 text-center text-sm">
                  Nothing matches “{query}”.
                </p>
              ) : (
                <ul id="command-results" role="listbox" aria-label="Results">
                  {results.map((item, i) => (
                    <li
                      key={item.href}
                      id={`command-option-${i}`}
                      role="option"
                      aria-selected={i === index}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        onMouseEnter={() => setIndex(() => i)}
                        onClick={() => {
                          close();
                          router.push(item.href);
                        }}
                        className={cn(
                          "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                          i === index ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {i === index && (
                          <motion.span
                            layoutId="command-active"
                            transition={reduceMotion ? { duration: 0 } : snappy}
                            className="bg-secondary absolute inset-0 -z-10 rounded-lg"
                          />
                        )}
                        <item.icon
                          className={cn("size-4 shrink-0", i === index && "text-brand")}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">{item.label}</span>
                          <span className="text-faint block truncate text-xs">
                            {item.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
