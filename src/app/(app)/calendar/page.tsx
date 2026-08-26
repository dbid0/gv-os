import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { Kpi } from "@/components/ui/metric";
import { buttonVariants } from "@/components/ui/button";
import { dayKeyCT } from "@/lib/charts";
import {
  monthGrid,
  monthLabel,
  parseYearMonth,
  stepMonth,
} from "@/lib/calendar/month-grid";
import {
  listCalendarItems,
  listUnscheduledItems,
  type CalendarItem,
} from "@/lib/calendar/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendar - GV OS" };
export const dynamic = "force-dynamic";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

// A small status dot — the item's state, colour-coded, never a bare word.
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

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const sp = await searchParams;
  const todayKey = dayKeyCT(new Date());
  const [ty, tm] = todayKey.split("-").map(Number);
  const { year, month } = parseYearMonth(sp.ym) ?? { year: ty, month: tm };

  const fromKey = `${year}-${pad(month)}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const toKey = `${year}-${pad(month)}-${pad(lastDay)}`;

  const [items, unscheduled] = await Promise.all([
    listCalendarItems(fromKey, toKey),
    listUnscheduledItems(),
  ]);

  // Bucket the month's items by due date for O(1) cell lookup.
  const byDate = new Map<string, CalendarItem[]>();
  for (const it of items) {
    if (!it.dueDate) continue;
    const list = byDate.get(it.dueDate) ?? [];
    list.push(it);
    byDate.set(it.dueDate, list);
  }

  const weeks = monthGrid(year, month, todayKey);
  const prev = stepMonth(year, month, -1);
  const next = stepMonth(year, month, 1);
  const done = items.filter((i) => i.status === "completed").length;
  const inProgress = items.filter((i) => i.status === "in_progress").length;
  const notStarted = items.filter((i) => i.status === "not_started").length;

  const navBtn = cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Calendar"
        description="Tasks and action items across every offer, on the month they're due. Items land here from the agency task board and each offer's board."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/calendar?ym=${prev.year}-${pad(prev.month)}`}
              className={navBtn}
            >
              <ChevronLeft className="size-3.5" />
            </Link>
            <Link href="/calendar" className={cn(navBtn, "px-3")}>
              Today
            </Link>
            <Link
              href={`/calendar?ym=${next.year}-${pad(next.month)}`}
              className={navBtn}
            >
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={monthLabel(year, month)}
          value={String(items.length)}
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
                  "min-h-24 border-r border-b p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0",
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
                        "flex items-center gap-1 rounded px-1 py-0.5 text-[11px]",
                        "bg-secondary/60",
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
          events are synced. This is an honest marker, not a fake status. */}
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
