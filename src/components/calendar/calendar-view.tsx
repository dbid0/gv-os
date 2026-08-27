"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  ListChecks,
  Mic,
} from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { Kpi } from "@/components/ui/metric";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { monthGrid, monthLabel, stepMonth } from "@/lib/calendar/month-grid";
import type { CalendarEvent, CalendarItem } from "@/lib/calendar/queries";
import { clientBySlug } from "@/lib/roster";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

const STATUS_TONE: Record<string, string> = {
  not_started: "bg-faint",
  in_progress: "bg-warning",
  completed: "bg-success",
};

const SOURCE_LABEL: Record<string, string> = {
  agency_call: "Agency call",
  client_call: "Client call",
  manual: "Note",
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
function ClientTag({ name, slug }: { name: string; slug: string | null }) {
  const accent = slug ? (clientBySlug(slug)?.accent ?? null) : null;
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
 * The calendar shows REAL work: events (recorded client/team calls) and the
 * tasks due each day. Internal GV OS software-dev items are filtered upstream.
 * Clicking any day opens a lightweight Sheet with everything on that day.
 */
export function CalendarView({
  items,
  events,
  todayKey,
}: {
  items: CalendarItem[];
  events: CalendarEvent[];
  todayKey: string;
}) {
  const [ty, tm] = todayKey.split("-").map(Number);
  const [view, setView] = useState({ year: ty, month: tm });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { year, month } = view;
  const monthKey = `${year}-${pad(month)}`;
  const isThisMonth = year === ty && month === tm;

  const tasksByDate = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const it of items) {
      if (!it.dueDate || it.dueDate.slice(0, 7) !== monthKey) continue;
      m.set(it.dueDate, [...(m.get(it.dueDate) ?? []), it]);
    }
    return m;
  }, [items, monthKey]);

  const eventsByDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (!ev.date || ev.date.slice(0, 7) !== monthKey) continue;
      m.set(ev.date, [...(m.get(ev.date) ?? []), ev]);
    }
    return m;
  }, [events, monthKey]);

  const weeks = useMemo(
    () => monthGrid(year, month, todayKey),
    [year, month, todayKey],
  );

  const monthTasks = useMemo(() => [...tasksByDate.values()].flat(), [tasksByDate]);
  const monthEventCount = useMemo(
    () => [...eventsByDate.values()].reduce((n, list) => n + list.length, 0),
    [eventsByDate],
  );
  const done = monthTasks.filter((i) => i.status === "completed").length;
  const inProgress = monthTasks.filter((i) => i.status === "in_progress").length;

  const selectedTasks = selectedKey ? (tasksByDate.get(selectedKey) ?? []) : [];
  const selectedEvents = selectedKey ? (eventsByDate.get(selectedKey) ?? []) : [];

  const totalOnDay = (dateKey: string) =>
    (eventsByDate.get(dateKey)?.length ?? 0) + (tasksByDate.get(dateKey)?.length ?? 0);

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
        <Kpi label="Events" value={String(monthEventCount)} icon={Mic} />
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
            const dayEvents = eventsByDate.get(cell.dateKey) ?? [];
            const dayTasks = tasksByDate.get(cell.dateKey) ?? [];
            const total = dayEvents.length + dayTasks.length;
            // Events lead the cell; tasks fill the rest, up to three chips.
            const shownEvents = dayEvents.slice(0, 3);
            const shownTasks = dayTasks.slice(0, Math.max(0, 3 - shownEvents.length));
            const overflow = total - shownEvents.length - shownTasks.length;
            return (
              <button
                type="button"
                key={cell.dateKey}
                onClick={() => setSelectedKey(cell.dateKey)}
                className={cn(
                  "hover:bg-secondary/40 focus-visible:ring-ring/50 min-h-24 border-r border-b p-1.5 text-left transition-colors outline-none last:border-r-0 focus-visible:ring-2 [&:nth-child(7n)]:border-r-0",
                  !cell.inMonth && "bg-secondary/30",
                )}
                aria-label={`${fullDate(cell.dateKey)}${total ? `, ${total} item${total === 1 ? "" : "s"}` : ""}`}
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
                  {shownEvents.map((ev) => (
                    <div
                      key={ev.id}
                      title={`${ev.title}${ev.clientName ? ` · ${ev.clientName}` : ""}`}
                      className="bg-brand-soft/60 text-brand flex items-center gap-1 rounded px-1 py-0.5 text-[11px]"
                    >
                      <Mic className="size-2.5 shrink-0" />
                      <span className="truncate">{ev.title}</span>
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

      {items.length === 0 && events.length === 0 && (
        <Panel title="Nothing scheduled yet">
          <p className="text-faint py-8 text-center text-sm">
            <CalendarDays className="mr-1 inline size-4" />
            Recorded calls land here on the day they happened, and any task with a due
            date lands on that day. Give a task a due date and it shows up here.
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
          Two-way sync with Google Calendar — so meetings and hours show up here
          alongside the day&apos;s work — lands with the Google connection. Until then
          the calendar reflects recorded calls and the GV OS task boards only; nothing
          is pushed to or pulled from Google.
        </p>
      </Panel>

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
                  <Mic className="size-3" /> Events
                </h3>
                {selectedEvents.map((ev) => (
                  <div key={ev.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium">{ev.title}</span>
                      <span className="text-faint rounded-full border px-1.5 text-[10px]">
                        {SOURCE_LABEL[ev.source] ?? ev.source}
                      </span>
                      {ev.clientName && (
                        <ClientTag name={ev.clientName} slug={ev.clientSlug} />
                      )}
                    </div>
                    <div className="text-faint mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      {ev.attendees.length > 0 && (
                        <span>{ev.attendees.join(" · ")}</span>
                      )}
                      {ev.taskCount > 0 && (
                        <span className="text-foreground/70">
                          {ev.taskCount} task{ev.taskCount === 1 ? "" : "s"}
                        </span>
                      )}
                      {ev.docLink && (
                        <a
                          href={ev.docLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand inline-flex items-center gap-1 hover:underline"
                        >
                          <FileText className="size-3" /> Doc
                        </a>
                      )}
                    </div>
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
                      <ClientTag name={it.clientName} slug={it.clientSlug} />
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
