import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { CallLogRow } from "@/lib/calls/call-log";
import type { CallWeek } from "@/lib/calls/call-week";
import { cn } from "@/lib/utils";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
});

const shortDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/Chicago",
});

const dayName = (key: string, opts: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    ...opts,
    timeZone: "UTC",
  });
};

/** The chip's tone says where the call stands, the same words as the list. */
function tone(r: CallLogRow): { className: string; word: string } {
  if (r.state === "cancelled") {
    return {
      className: "border-muted-foreground/30 text-muted-foreground",
      word: r.movedTo
        ? `Moved to ${shortDay.format(r.movedTo)}`
        : r.rescheduled
          ? "Rescheduled"
          : "Cancelled",
    };
  }
  if (r.state === "needs_outcome") {
    return { className: "border-warning/50 bg-warning/5", word: "Needs an outcome" };
  }
  if (r.outcome === "closed") {
    return { className: "border-success/50 bg-success/5", word: "Closed" };
  }
  if (r.outcome === "no_show") {
    return { className: "border-warning/40", word: "No-show" };
  }
  if (r.outcome === "showed") return { className: "border-brand/40", word: "Showed" };
  if (r.outcome === "not_held") {
    return { className: "border-muted-foreground/30", word: "Not held" };
  }
  return {
    className: "border-brand/30",
    word: r.confirmation === "in_time" ? "Confirmed" : "Upcoming",
  };
}

/**
 * One week of calls, Sunday to Saturday in Central time. Seven columns on a
 * wide screen, a day-by-day list on a narrow one. Every chip opens the lead.
 */
export function CallWeekGrid({
  week,
  slug,
  hrefFor,
}: {
  week: CallWeek;
  slug: string;
  /** The page URL showing another week, keeping the other filters. */
  hrefFor: (weekKey: string) => string;
}) {
  const first = week.days[0].dateKey;
  const last = week.days[6].dateKey;
  const total = week.days.reduce((n, d) => n + d.rows.length, 0);

  return (
    <section aria-label="Calls this week" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={hrefFor(week.prevKey)}
            aria-label="Previous week"
            className="hover:bg-secondary/60 rounded-md border p-1.5"
          >
            <ChevronLeft className="size-3.5" />
          </Link>
          <Link
            href={hrefFor(week.nextKey)}
            aria-label="Next week"
            className="hover:bg-secondary/60 rounded-md border p-1.5"
          >
            <ChevronRight className="size-3.5" />
          </Link>
          <h2 className="ml-2 text-sm font-medium">
            {dayName(first, { month: "short", day: "numeric" })} –{" "}
            {dayName(last, { month: "short", day: "numeric", year: "numeric" })}
          </h2>
        </div>
        <p className="text-faint text-xs">
          {total} call{total === 1 ? "" : "s"} this week
          {week.undated > 0 && ` · ${week.undated} with no start time (list view)`}
        </p>
      </div>

      <div className="grid gap-2 lg:grid-cols-7">
        {week.days.map((day) => (
          <div
            key={day.dateKey}
            className={cn(
              "bg-card min-h-24 rounded-xl border p-2",
              day.isToday && "border-brand/50",
            )}
          >
            <p
              className={cn(
                "mb-2 flex items-baseline justify-between text-[11px] font-medium tracking-wider uppercase",
                day.isToday ? "text-brand" : "text-faint",
              )}
            >
              <span>{dayName(day.dateKey, { weekday: "short", day: "numeric" })}</span>
              {day.rows.length > 0 && (
                <span className="tabular-nums">{day.rows.length}</span>
              )}
            </p>
            {day.rows.length === 0 ? (
              <p className="text-faint text-[11px]">No calls</p>
            ) : (
              <ul className="space-y-1.5">
                {day.rows.map((r) => {
                  const t = tone(r);
                  const name = r.inviteeName ?? r.inviteeEmail ?? "Unknown invitee";
                  const body = (
                    <>
                      <span className="text-faint block truncate text-[10px] tabular-nums">
                        {timeFmt.format(r.startsAt as Date)} · {t.word}
                      </span>
                      <span className="block truncate text-xs font-medium">{name}</span>
                    </>
                  );
                  return (
                    <li
                      key={r.bookingId}
                      title={
                        [
                          r.movedFrom && `Moved from ${shortDay.format(r.movedFrom)}`,
                          r.cancelReason,
                        ]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                    >
                      {r.inviteeEmail ? (
                        <Link
                          href={`/w/${slug}/leads/${encodeURIComponent(r.inviteeEmail)}`}
                          className={cn(
                            "hover:bg-secondary/60 block rounded-md border px-2 py-1 transition-colors",
                            t.className,
                          )}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={cn("rounded-md border px-2 py-1", t.className)}>
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
