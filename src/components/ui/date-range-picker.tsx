"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { type HomeRange } from "@/lib/transactions/homepage";
import { cn } from "@/lib/utils";

/**
 * The Whop-pattern range control (Daniel's screenshots): a preset dropdown
 * and a date box side by side. The date box opens a calendar with month +
 * year dropdowns and Cancel / Set — drag or click a span, Set applies it.
 * The chosen span rides in the URL; numbers recompute server-side.
 */

const PRESETS: { key: HomeRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "4w", label: "Last 4 weeks" },
  { key: "90d", label: "Last 3 months" },
  { key: "12m", label: "Last 12 months" },
  { key: "life", label: "All time" },
  { key: "month", label: "Month to date" },
  { key: "qtd", label: "Quarter to date" },
  { key: "ytd", label: "Year to date" },
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

const boxClass =
  "bg-card flex items-center gap-2 border px-3 py-1.5 text-xs transition-colors hover:border-brand/40";

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
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
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
    if (!presetsOpen && !calOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPresetsOpen(false);
        setCalOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [presetsOpen, calOpen]);

  const activeLabel =
    activeRange === "custom"
      ? "Custom"
      : (PRESETS.find((p) => p.key === activeRange)?.label ?? "Month to date");

  const apply = (query: string) => {
    setPresetsOpen(false);
    setCalOpen(false);
    setSelStart(null);
    setSelEnd(null);
    router.push(`${basePath}${query}`);
  };

  const setRange = () => {
    if (!selStart) return;
    const end = selEnd ?? selStart;
    const [lo, hi] = selStart <= end ? [selStart, end] : [end, selStart];
    apply(`?range=custom&from=${lo}&to=${hi}`);
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
    { length: 4 },
    (_, i) => Number(todayKey.slice(0, 4)) - 3 + i + 0,
  );

  return (
    <div ref={rootRef} className="relative flex">
      {/* Preset dropdown — the left box. */}
      <button
        type="button"
        onClick={() => {
          setPresetsOpen((o) => !o);
          setCalOpen(false);
        }}
        className={cn(boxClass, "rounded-l-lg border-r-0 font-medium")}
        aria-label="Choose a preset range"
      >
        {activeLabel}
        <ChevronDown
          className={cn("size-3 transition-transform", presetsOpen && "rotate-180")}
        />
      </button>

      {/* Date box — the right box, opens the calendar. */}
      <button
        type="button"
        onClick={() => {
          setCalOpen((o) => !o);
          setPresetsOpen(false);
        }}
        className={cn(boxClass, "rounded-r-lg tabular-nums")}
        aria-label="Change date range"
      >
        <CalendarDays className="text-brand size-3.5" />
        {activeRange === "life"
          ? "All time"
          : from === to
            ? fmtBoxDate(from)
            : `${fmtBoxDate(from)} – ${fmtBoxDate(to)}`}
      </button>

      {presetsOpen && (
        <div className="gv-pop-in bg-card absolute top-full left-0 z-40 mt-2 flex w-44 flex-col gap-0.5 rounded-xl border p-1.5 shadow-xl">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => apply(p.key === "month" ? "" : `?range=${p.key}`)}
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
      )}

      {calOpen && (
        <div className="gv-pop-in bg-card absolute top-full right-0 z-40 mt-2 rounded-xl border p-4 shadow-xl">
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
            <select
              value={cursor.month}
              onChange={(e) => setCursor({ ...cursor, month: Number(e.target.value) })}
              className="border-input h-7 rounded-md border bg-transparent px-2 text-xs outline-none"
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
              onChange={(e) => setCursor({ ...cursor, year: Number(e.target.value) })}
              className="border-input h-7 rounded-md border bg-transparent px-2 text-xs outline-none"
              aria-label="Year"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
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
            {WEEKDAYS.map((w, i) => (
              <span key={`${w}-${i}`}>{w}</span>
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
                      onMouseDown={() => {
                        setSelStart(key);
                        setSelEnd(key);
                        setDragging(true);
                      }}
                      onMouseEnter={() => dragging && setSelEnd(key)}
                      onMouseUp={() => setDragging(false)}
                      className={cn(
                        "m-px grid size-8 place-items-center rounded-md text-[11px] tabular-nums transition-colors select-none",
                        key > todayKey && "text-faint/50 cursor-not-allowed",
                        key <= todayKey && "hover:bg-brand-soft/60 cursor-pointer",
                        dayState(key) === "in" && "bg-brand-soft/50",
                        dayState(key) === "edge" && "bg-brand font-semibold text-white",
                      )}
                    >
                      {Number(key.slice(8))}
                    </button>
                  ),
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-end gap-2 border-t pt-3">
            <button
              type="button"
              onClick={() => {
                setCalOpen(false);
                setSelStart(null);
                setSelEnd(null);
              }}
              className="text-muted-foreground hover:text-foreground rounded-md border px-3 py-1.5 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={setRange}
              disabled={!selStart}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                selStart
                  ? "bg-brand text-white hover:opacity-90 active:scale-95"
                  : "text-faint cursor-not-allowed border",
              )}
            >
              Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
