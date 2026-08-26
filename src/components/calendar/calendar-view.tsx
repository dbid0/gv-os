"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { Kpi } from "@/components/ui/metric";
import { monthGrid, monthLabel, stepMonth } from "@/lib/calendar/month-grid";
import type { CalendarItem } from "@/lib/calendar/queries";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

const STATUS_TONE: Record<string, string> = {
  not_started: "bg-faint",
  in_progress: "bg-warning",
  completed: "bg-success",
};

function ItemDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        STATUS_TONE[status] ?? "bg-faint",
      )}
    />
  );
}

/**
 * The calendar's month view. Month navigation happens entirely in the browser —
 * the server hands over a wide window of items once, and paging between months
 * is instant state, never a round-trip. That's the fix for the old nav feeling
 * glitchy: every prev/next used to re-fetch and re-render the whole page.
 */
export function CalendarView({
  items,
  unscheduled,
  todayKey,
}: {
  items: CalendarItem[];
  unscheduled: CalendarItem[];
  todayKey: string;
}) {
  const [ty, tm] = todayKey.split("-").map(Number);
  const [view, setView] = useState({ year: ty, month: tm });
  const { year, month } = view;
  const monthKey = `${year}-${pad(month)}`;
  const isThisMonth = year === ty && month === tm;

  const monthItems = useMemo(
    () => items.filter((i) => i.dueDate && i.dueDate.slice(0, 7) === monthKey),
    [items, monthKey],
  );
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of monthItems) {
      if (!it.dueDate) continue;
      m.set(it.dueDate, [...(m.get(it.dueDate) ?? []), it]);
    }
    return m;
  }, [monthItems]);

  const weeks = useMemo(
    () => monthGrid(year, month, todayKey),
    [year, month, todayKey],
  );
  const done = monthItems.filter((i) => i.status === "completed").length;
  const inProgress = monthItems.filter((i) => i.status === "in_progress").length;
  const notStarted = monthItems.filter((i) => i.status === "not_started").length;

  return (
    <div className="space-y-6">
      {/* Month control — the name sits between the arrows so it's obvious you're
          paging by month, and each step is instant. */}
      <div className="flex items-center justify-between">
        <div className="bg-secondary/50 flex items-center gap-1 rounded-lg border p-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setView(stepMonth(year, month, -1))}
            className="hover:bg-card grid size-7 place-items-center rounded-md transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-40 text-center text-sm font-semibold">
            {monthLabel(year, month)}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setView(stepMonth(year, month, 1))}
            className="hover:bg-card grid size-7 place-items-center rounded-md transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        {!isThisMonth && (
          <button
            type="button"
            onClick={() => setView({ year: ty, month: tm })}
            className="text-muted-foreground hover:text-foreground rounded-lg border px-3 py-1.5 text-sm transition-colors"
          >
            Today
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={monthLabel(year, month)}
          value={String(monthItems.length)}
          tone="brand"
        />
        <Kpi label="In progress" value={String(inProgress)} tone="warning" />
        <Kpi label="Not started" value={String(notStarted)} />
        <Kpi label="Completed" value={String(done)} tone="success" />
      </div>

      <Panel padded={false}>
        <div className="grid grid-cols-7 border-b">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="text-faint px-2 py-2 text-center text-[11px] font-medium tracking-wider uppercase"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((cell) => {
            const dayItems = byDate.get(cell.dateKey) ?? [];
            return (
              <div
                key={cell.dateKey}
                className={cn(
                  "hover:bg-secondary/40 min-h-24 border-r border-b p-1.5 transition-colors last:border-r-0 [&:nth-child(7n)]:border-r-0",
                  !cell.inMonth && "bg-secondary/30",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full text-[11px]",
                      cell.isToday && "bg-brand font-semibold text-white",
                      !cell.isToday && !cell.inMonth && "text-faint",
                      !cell.isToday && cell.inMonth && "text-muted-foreground",
                    )}
                  >
                    {cell.day}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map((it) => (
                    <div
                      key={it.id}
                      title={`${it.title}${it.clientName ? ` · ${it.clientName}` : ""}`}
                      className={cn(
                        "bg-secondary/60 flex items-center gap-1 rounded px-1 py-0.5 text-[11px]",
                        it.status === "completed" && "text-faint line-through",
                      )}
                    >
                      <ItemDot status={it.status} />
                      <span className="truncate">{it.title}</span>
                    </div>
                  ))}
                  {dayItems.length > 3 && (
                    <p className="text-faint px-1 text-[10px]">
                      +{dayItems.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {unscheduled.length > 0 && (
        <Panel
          title="Unscheduled"
          aside={<span className="text-faint text-xs">{unscheduled.length} open</span>}
        >
          <div className="space-y-1.5">
            {unscheduled.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <ItemDot status={it.status} />
                <span className="min-w-0 flex-1 truncate">{it.title}</span>
                {it.clientName && (
                  <span className="text-muted-foreground rounded-full border px-1.5 text-[11px]">
                    {it.clientName}
                  </span>
                )}
                {it.assignee && (
                  <span className="text-faint text-[11px]">{it.assignee}</span>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {items.length === 0 && unscheduled.length === 0 && (
        <Panel title="No tasks yet">
          <p className="text-faint py-8 text-center text-sm">
            <CalendarDays className="mr-1 inline size-4" />
            Action items appear here as they&apos;re created — from the agency task
            board (Discord #tasks) or each offer&apos;s board. Give one a due date and
            it lands on that day.
          </p>
        </Panel>
      )}

      {/* Google Calendar sync is on the roadmap; until it's wired we never claim
          events are synced. An honest marker, not a fake status. */}
      <Panel
        title="Google Calendar sync"
        aside={<StatusPill tone="pending">Planned</StatusPill>}
      >
        <p className="text-muted-foreground text-sm">
          Two-way sync with Google Calendar — so these tasks show up alongside your
          meetings — lands with the Google connection. Until then the calendar reflects
          the GV OS task boards only; nothing is pushed to or pulled from Google.
        </p>
      </Panel>
    </div>
  );
}
