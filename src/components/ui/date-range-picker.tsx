"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { HOME_RANGES, type HomeRange } from "@/lib/transactions/homepage";
import { cn } from "@/lib/utils";

/**
 * The Whop-style range control (v2 §4, Daniel's spec): a date box that opens
 * an animated popover — presets down the side, a two-month calendar you can
 * DRAG a range across. The chosen span rides in the URL so any view is
 * shareable; the numbers behind it recompute server-side.
 */

const PRESET_LABELS: Record<HomeRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  "last-month": "Last month",
  "90d": "Last 3 months",
  ytd: "Year to date",
  life: "Lifetime",
};

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
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

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

function fmtBoxDate(key: string | null): string {
  if (!key) return "…";
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}

export function DateRangePicker({
  basePath,
  activeRange,
  from,
  to,
  todayKey,
}: {
  basePath: string;
  /** The preset in play, or "custom". */
  activeRange: HomeRange | "custom";
  /** Resolved bounds for display (null side = unbounded/lifetime). */
  from: string | null;
  to: string | null;
  todayKey: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [viewYear, viewMonth] = (() => {
    const anchor = to ?? todayKey;
    const [y, m] = anchor.split("-").map(Number);
    return [y, m - 1];
  })();
  const [cursor, setCursor] = useState({ year: viewYear, month: viewMonth });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
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

  const applyCustom = (a: string, b: string) => {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    apply(`?range=custom&from=${lo}&to=${hi}`);
  };

  const dayState = (key: string): "start" | "end" | "in" | "out" => {
    const a = selStart ?? from;
    const b = (dragging || selStart ? selEnd : to) ?? a;
    if (!a || !b) return "out";
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (key === lo) return "start";
    if (key === hi) return "end";
    return key > lo && key < hi ? "in" : "out";
  };

  const prevMonth = () =>
    setCursor((c) =>
      c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 },
    );
  const nextMonth = () =>
    setCursor((c) =>
      c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 },
    );

  const second =
    cursor.month === 11
      ? { year: cursor.year + 1, month: 0 }
      : { year: cursor.year, month: cursor.month + 1 };

  const renderMonth = (year: number, month: number) => (
    <div className="min-w-52">
      <p className="mb-1.5 text-center text-xs font-medium">
        {MONTHS[month]} {year}
      </p>
      <div className="text-faint grid grid-cols-7 text-center text-[10px]">
        {WEEKDAYS.map((w, i) => (
          <span key={`${w}-${i}`}>{w}</span>
        ))}
      </div>
      {monthGrid(year, month).map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((key, di) =>
            key === null ? (
              <span key={di} />
            ) : (
              <button
                key={key}
                type="button"
                disabled={key > todayKey}
                onMouseDown={() => {
                  setSelStart(key);
                  setSelEnd(key);
                  setDragging(true);
                }}
                onMouseEnter={() => {
                  if (dragging) setSelEnd(key);
                }}
                onMouseUp={() => {
                  if (dragging && selStart) {
                    setDragging(false);
                    applyCustom(selStart, key);
                  }
                }}
                className={cn(
                  "m-px grid size-7 place-items-center rounded-md text-[11px] tabular-nums transition-colors select-none",
                  key > todayKey && "text-faint/50 cursor-not-allowed",
                  key <= todayKey && "hover:bg-brand-soft/60 cursor-pointer",
                  dayState(key) === "in" && "bg-brand-soft/50",
                  (dayState(key) === "start" || dayState(key) === "end") &&
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
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "bg-card hover:border-brand/40 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all",
          open && "border-brand/40",
        )}
        aria-label="Change date range"
      >
        <CalendarDays className="text-brand size-3.5" />
        <span className="font-medium tabular-nums">
          {activeRange === "life"
            ? "Lifetime"
            : `${fmtBoxDate(from)} – ${fmtBoxDate(to)}`}
        </span>
        <span className="text-faint">
          {activeRange === "custom" ? "Custom" : PRESET_LABELS[activeRange]}
        </span>
      </button>

      {open && (
        <div className="gv-pop-in bg-card absolute top-full right-0 z-40 mt-2 flex gap-4 rounded-xl border p-4 shadow-xl">
          <div className="flex min-w-32 flex-col gap-0.5 border-r pr-4">
            {HOME_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => apply(r === "month" ? "" : `?range=${r}`)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                  r === activeRange
                    ? "bg-brand-soft/70 text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )}
              >
                {PRESET_LABELS[r]}
              </button>
            ))}
          </div>
          <div
            className="flex gap-6"
            onMouseLeave={() => {
              if (dragging) setDragging(false);
            }}
          >
            <div>
              <button
                type="button"
                onClick={prevMonth}
                aria-label="Previous month"
                className="text-faint hover:text-foreground absolute mt-0.5 rounded p-1 transition-colors"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              {renderMonth(cursor.year, cursor.month)}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={nextMonth}
                aria-label="Next month"
                className="text-faint hover:text-foreground absolute top-0.5 right-0 rounded p-1 transition-colors"
              >
                <ChevronRight className="size-3.5" />
              </button>
              {renderMonth(second.year, second.month)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
