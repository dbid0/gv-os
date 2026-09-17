"use client";

import Link from "next/link";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { Kpi } from "@/components/ui/metric";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { monthGrid, monthLabel, stepMonth } from "@/lib/calendar/month-grid";
import { groupByDay } from "@/lib/calendar/expand";
import type {
  CalendarFeedEvent,
  CalendarFeedStatus,
  CalendarItem,
} from "@/lib/calendar/queries";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

const STATUS_TONE: Record<string, string> = {
  not_started: "bg-faint",
  in_progress: "bg-warning",
  completed: "bg-success",
};

/** "2026-08-26" -> "Wednesday, August 26, 2026". Date-only, timezone-safe. */
function fullDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * A meeting's clock time.
 *
 * The sync already resolved which DAY each event lands on, in the viewer's
 * zone, so the grid never re-derives a day here — only the time shown inside
 * the day it was already placed on.
 */
function timeOf(at: Date): string {
  return new Date(at)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(":00", "")
    .replace(" ", "");
}

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

/** A client's own accent colour as a small tag. */
function ClientTag({ name, accent }: { name: string; accent: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] whitespace-nowrap"
      style={{ color: accent ?? "var(--muted-foreground)" }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: accent ?? "var(--muted-foreground)" }}
      />
      {name}
    </span>
  );
}

/**
 * The calendar's month view. Month navigation happens entirely in the browser —
 * the server hands over a wide window of items once, and paging between months
 * is instant state, never a round-trip.
 *
 * The calendar shows REAL work: the tasks due each day. Internal GV OS
 * software-dev items are filtered upstream.
 * Clicking any day opens a lightweight Sheet with everything on that day.
 */
export function CalendarView({
  items,
  events = [],
  feed,
  todayKey,
  accents,
}: {
  items: CalendarItem[];
  /** Meetings mirrored from a connected calendar feed. */
  events?: CalendarFeedEvent[];
  /** Whether a feed is connected and when it last landed. */
  feed?: CalendarFeedStatus;
  todayKey: string;
  /** slug → the client's accent colour, resolved server-side (DB roster). */
  accents: Record<string, string>;
}) {
  const [ty, tm] = todayKey.split("-").map(Number);
  const [view, setView] = useState({ year: ty, month: tm });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { year, month } = view;
  const monthKey = `${year}-${pad(month)}`;
  const isThisMonth = year === ty && month === tm;

  const tasksByDate = useMemo(() => {
    // Dated items land on their day; undated ones land on their cadence's
    // rhythm (daily / Mondays / the 1st) — the work board and the calendar
    // stay in sync without anyone scheduling standing tasks by hand.
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return groupByDay(items, `${monthKey}-01`, `${monthKey}-${pad(last)}`);
  }, [items, monthKey, year, month]);

  const weeks = useMemo(
    () => monthGrid(year, month, todayKey),
    [year, month, todayKey],
  );

  // Events already carry the day they land on — the sync resolved it once, in
  // the viewer's zone, so the grid never re-derives a day from a timestamp.
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarFeedEvent[]>();
    for (const e of events) {
      const list = map.get(e.dayKey) ?? [];
      list.push(e);
      map.set(e.dayKey, list);
    }
    return map;
  }, [events]);

  const monthTasks = useMemo(() => [...tasksByDate.values()].flat(), [tasksByDate]);
  const done = monthTasks.filter((i) => i.status === "completed").length;
  const inProgress = monthTasks.filter((i) => i.status === "in_progress").length;

  const selectedTasks = selectedKey ? (tasksByDate.get(selectedKey) ?? []) : [];
  const selectedEvents = selectedKey ? (eventsByDate.get(selectedKey) ?? []) : [];

  const totalOnDay = (dateKey: string) =>
    (tasksByDate.get(dateKey)?.length ?? 0) + (eventsByDate.get(dateKey)?.length ?? 0);

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
          label={`${monthLabel(year, month)} tasks`}
          value={String(monthTasks.length)}
          tone="brand"
        />
        <Kpi label="In progress" value={String(inProgress)} tone="warning" />
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
            const dayTasks = tasksByDate.get(cell.dateKey) ?? [];
            const dayEvents = eventsByDate.get(cell.dateKey) ?? [];
            // Meetings first — a cell is read to answer "am I free", and an
            // hour that is already committed answers it. Three chips in all;
            // the rest roll into "+N more".
            const shownEvents = dayEvents.slice(0, 2);
            const shownTasks = dayTasks.slice(0, Math.max(0, 3 - shownEvents.length));
            const overflow =
              dayTasks.length -
              shownTasks.length +
              (dayEvents.length - shownEvents.length);
            return (
              <button
                type="button"
                key={cell.dateKey}
                onClick={() => setSelectedKey(cell.dateKey)}
                className={cn(
                  "hover:bg-secondary/40 focus-visible:ring-ring/50 min-h-24 border-r border-b p-1.5 text-left transition-colors outline-none last:border-r-0 focus-visible:ring-2 [&:nth-child(7n)]:border-r-0",
                  !cell.inMonth && "bg-secondary/30",
                )}
                aria-label={`${fullDate(cell.dateKey)}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""}${dayTasks.length ? `, ${dayTasks.length} task${dayTasks.length === 1 ? "" : "s"}` : ""}`}
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
                  {shownEvents.map((e) => (
                    <div
                      key={e.id}
                      title={`${e.allDay ? "All day" : timeOf(e.startsAt)} · ${e.summary ?? "No title"}`}
                      className="border-brand/40 bg-brand-soft/40 flex items-center gap-1 rounded border-l-2 px-1 py-0.5 text-[11px]"
                    >
                      {!e.allDay && (
                        <span className="text-faint shrink-0 tabular-nums">
                          {timeOf(e.startsAt)}
                        </span>
                      )}
                      <span className="truncate">{e.summary ?? "No title"}</span>
                    </div>
                  ))}
                  {shownTasks.map((it) => (
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
                  {overflow > 0 && (
                    <p className="text-faint px-1 text-[10px]">+{overflow} more</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      {items.length === 0 && (
        <Panel title="Nothing scheduled yet">
          <p className="text-faint py-8 text-center text-sm">
            <CalendarDays className="mr-1 inline size-4" />
            Any task with a due date lands on that day. Give a task a due date and it
            shows up here.
          </p>
        </Panel>
      )}

      {/* The feed's real state. It used to say "Planned" — it is connected now,
          so the panel reports what actually landed, or how to connect one. */}
      <p className="text-faint text-xs">
        {feed?.connected
          ? `Google Calendar · ${
              feed.lastSyncAt
                ? `synced ${feed.lastSyncAt.toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : "not pulled yet"
            }${feed.lastSyncNote ? ` · ${feed.lastSyncNote}` : ""} · read-only`
          : "No calendar connected."}{" "}
        <Link href="/settings/integrations" className="text-brand hover:underline">
          Integrations →
        </Link>
      </p>

      {/* Day detail — a light Sheet, no heavy motion, opened by clicking a day. */}
      <Sheet
        open={selectedKey !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedKey(null);
        }}
      >
        <SheetContent className="gap-0">
          <SheetHeader className="border-b">
            <SheetTitle>{selectedKey ? fullDate(selectedKey) : ""}</SheetTitle>
            {/* Names both kinds: with meetings above the tasks, a bare "1 task"
                under three of them reads as a miscount. */}
            <SheetDescription>
              {selectedKey && totalOnDay(selectedKey) > 0
                ? [
                    selectedEvents.length > 0 &&
                      `${selectedEvents.length} event${selectedEvents.length === 1 ? "" : "s"}`,
                    selectedTasks.length > 0 &&
                      `${selectedTasks.length} task${selectedTasks.length === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Nothing on this day."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            {selectedEvents.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-faint flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
                  <CalendarDays className="size-3" /> Calendar
                </h3>
                {selectedEvents.map((e) => (
                  <div
                    key={e.id}
                    className="border-brand/40 flex items-center gap-2 rounded-lg border border-l-2 px-3 py-2"
                  >
                    <span className="text-muted-foreground w-24 shrink-0 text-xs tabular-nums">
                      {e.allDay
                        ? "All day"
                        : `${timeOf(e.startsAt)}${e.endsAt ? `–${timeOf(e.endsAt)}` : ""}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {e.summary ?? <span className="text-faint">No title</span>}
                    </span>
                    {e.clientName && (
                      <ClientTag
                        name={e.clientName}
                        accent={e.clientSlug ? (accents[e.clientSlug] ?? null) : null}
                      />
                    )}
                  </div>
                ))}
              </section>
            )}

            {selectedTasks.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-faint flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
                  <ListChecks className="size-3" /> Tasks
                </h3>
                {selectedTasks.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2"
                  >
                    <ItemDot status={it.status} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        it.status === "completed" && "text-faint line-through",
                      )}
                    >
                      {it.title}
                    </span>
                    {it.clientName && (
                      <ClientTag
                        name={it.clientName}
                        accent={it.clientSlug ? (accents[it.clientSlug] ?? null) : null}
                      />
                    )}
                    {it.assignee && (
                      <span className="text-faint text-[11px] whitespace-nowrap">
                        {it.assignee}
                      </span>
                    )}
                  </div>
                ))}
              </section>
            )}

            {selectedKey && totalOnDay(selectedKey) === 0 && (
              <div className="text-faint flex flex-col items-center gap-3 py-12 text-center">
                <CalendarDays className="size-6 opacity-50" />
                <p className="max-w-xs text-sm">
                  Nothing scheduled on this day. Calls appear here once recorded, and
                  tasks appear once they have a due date.
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
