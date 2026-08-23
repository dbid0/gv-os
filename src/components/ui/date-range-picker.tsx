"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { type HomeRange } from "@/lib/transactions/homepage";
import { cn } from "@/lib/utils";

/**
 * The range control, RepVision format (Daniel's screenshot): ONE trigger
 * showing the active span, opening a single panel with the preset list down
 * the left and the calendar on the right. Pick a preset — or click a start
 * then an end day — and the numbers recompute server-side. The span rides in
 * the URL so it is shareable.
 */

const PRESETS: { key: HomeRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "this-week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "qtd", label: "This quarter" },
  { key: "last-quarter", label: "Last quarter" },
  { key: "ytd", label: "This year" },
  { key: "last-year", label: "Last year" },
  { key: "life", label: "All time" },
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => keyOf(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** "Jul 25 – Aug 23, 2026", collapsing the year when both ends share it. */
function fmtSpan(from: string | null, to: string | null): string {
  if (!from || !to) return "All time";
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const left = `${MONTHS[fm - 1].slice(0, 3)} ${fd}`;
  const right = `${MONTHS[tm - 1].slice(0, 3)} ${td}, ${ty}`;
  if (from === to) return right;
  return fy === ty ? `${left} – ${right}` : `${left}, ${fy} – ${right}`;
}

export function DateRangePicker({
  basePath,
  activeRange,
  from,
  to,
  todayKey,
}: {
  basePath: string;
  activeRange: HomeRange | "custom";
  from: string | null;
  to: string | null;
  todayKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const anchor = to ?? todayKey;
  const [cursor, setCursor] = useState(() => {
    const [y, m] = anchor.split("-").map(Number);
    return { year: y, month: m - 1 };
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSelStart(null);
        setSelEnd(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const apply = (query: string) => {
    setOpen(false);
    setSelStart(null);
    setSelEnd(null);
    router.push(`${basePath}${query}`);
  };

  const applyPreset = (key: HomeRange) => apply(key === "month" ? "" : `?range=${key}`);

  const applyCustom = (lo: string, hi: string) => {
    const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
    apply(`?range=custom&from=${a}&to=${b}`);
  };

  // Click a start, then an end. A second click completes and applies; a drag
  // does the same on release.
  const onDayDown = (key: string) => {
    if (selStart && !selEnd) {
      applyCustom(selStart, key);
      return;
    }
    setSelStart(key);
    setSelEnd(null);
    setDragging(true);
  };

  const dayState = (key: string): "edge" | "in" | "out" => {
    const a = selStart ?? from;
    const b = (selStart ? (selEnd ?? selStart) : to) ?? a;
    if (!a || !b) return "out";
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (key === lo || key === hi) return "edge";
    return key > lo && key < hi ? "in" : "out";
  };

  const years = Array.from(
    { length: 6 },
    (_, i) => Number(todayKey.slice(0, 4)) - 4 + i,
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="bg-card hover:border-brand/40 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors"
        aria-label="Change date range"
      >
        <CalendarDays className="text-brand size-3.5" />
        {fmtSpan(from, to)}
        <ChevronDown
          className={cn("text-faint size-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="gv-pop-in bg-card absolute top-full right-0 z-40 mt-2 flex overflow-hidden rounded-xl border shadow-xl">
          {/* Preset list — the left column. */}
          <div className="flex w-40 flex-col gap-0.5 border-r p-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                  p.key === activeRange
                    ? "bg-brand-soft/70 text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar — the right column. */}
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  setCursor((c) =>
                    c.month === 0
                      ? { year: c.year - 1, month: 11 }
                      : { ...c, month: c.month - 1 },
                  )
                }
                aria-label="Previous month"
                className="text-faint hover:text-foreground rounded-md border p-1 transition-colors"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <div className="flex items-center gap-1.5">
                <select
                  value={cursor.month}
                  onChange={(e) =>
                    setCursor({ ...cursor, month: Number(e.target.value) })
                  }
                  className="border-input h-7 rounded-md border bg-transparent px-2 text-xs font-medium outline-none"
                  aria-label="Month"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={cursor.year}
                  onChange={(e) =>
                    setCursor({ ...cursor, year: Number(e.target.value) })
                  }
                  className="border-input h-7 rounded-md border bg-transparent px-2 text-xs outline-none"
                  aria-label="Year"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() =>
                  setCursor((c) =>
                    c.month === 11
                      ? { year: c.year + 1, month: 0 }
                      : { ...c, month: c.month + 1 },
                  )
                }
                aria-label="Next month"
                className="text-faint hover:text-foreground rounded-md border p-1 transition-colors"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>

            <div className="text-faint grid grid-cols-7 text-center text-[10px]">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div onMouseLeave={() => dragging && setDragging(false)}>
              {monthGrid(cursor.year, cursor.month).map((week, wi) => (
                <div key={wi} className="grid grid-cols-7">
                  {week.map((key, di) =>
                    key === null ? (
                      <span key={di} />
                    ) : (
                      <button
                        key={key}
                        type="button"
                        disabled={key > todayKey}
                        onMouseDown={() => onDayDown(key)}
                        onMouseEnter={() => dragging && setSelEnd(key)}
                        onMouseUp={() => {
                          if (dragging && selStart && selEnd && selEnd !== selStart) {
                            applyCustom(selStart, selEnd);
                          }
                          setDragging(false);
                        }}
                        className={cn(
                          "m-px grid size-8 place-items-center rounded-md text-[11px] tabular-nums transition-colors select-none",
                          key > todayKey && "text-faint/50 cursor-not-allowed",
                          key <= todayKey && "hover:bg-brand-soft/60 cursor-pointer",
                          dayState(key) === "in" && "bg-brand-soft/50",
                          dayState(key) === "edge" &&
                            "bg-brand font-semibold text-white",
                        )}
                      >
                        {Number(key.slice(8))}
                      </button>
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
