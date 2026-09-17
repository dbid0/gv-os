"use client";

import { CalendarClock } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import type { CallQueue, QueuedCall } from "@/lib/home/call-queue";
import { cn } from "@/lib/utils";
import { useViewerTimeZone } from "@/components/shell/time-zone";

/**
 * The rep's call board — what is on the calendar, next call first.
 *
 * It is the FIRST thing on the rep home because it is the only part of that
 * page a rep acts on. Everything else there reports how the week has gone.
 *
 * It is titled by the offer, not "your calls": bookings carry the offer they
 * came in under and no scheduler we sync names a rep on them, so calling this
 * list personal would assert an assignment that exists nowhere in the data.
 *
 * A call whose time has passed stays on the board, dimmed, rather than
 * vanishing at the top of the hour — a rep who ran long needs to see the one
 * they are still on.
 */

const time = (d: Date, timeZone: string) =>
  new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

const dayAndTime = (d: Date, timeZone: string) =>
  new Date(d).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

function CallRow({
  call,
  isNext,
  timeZone,
}: {
  call: QueuedCall;
  isNext: boolean;
  timeZone: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-3 px-5 py-2.5 text-sm",
        call.started && !isNext && "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "w-20 shrink-0 tabular-nums",
          isNext ? "text-brand font-medium" : "text-muted-foreground",
        )}
      >
        {time(call.startsAt, timeZone)}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {call.name ?? <span className="text-faint">No name</span>}
      </span>
      {call.eventType && (
        <span className="text-faint hidden shrink-0 truncate text-xs sm:block">
          {call.eventType}
        </span>
      )}
    </div>
  );
}

export function CallBoard({
  queue,
  offerName,
}: {
  queue: CallQueue;
  /** The offer whose board this is. */
  offerName: string | null;
}) {
  const timeZone = useViewerTimeZone();
  const nextId = queue.next?.id ?? null;
  const nextIsToday = queue.today.some((c) => c.id === nextId);

  return (
    <Panel
      title={offerName ? `${offerName} calls` : "Calls"}
      padded={false}
      aside={
        <span className="flex items-center gap-2">
          {queue.upcoming > 0 && (
            <span className="text-faint text-xs">{queue.upcoming} later</span>
          )}
          <StatusPill tone={queue.today.length > 0 ? "live" : "muted"}>
            {queue.today.length} today
          </StatusPill>
        </span>
      }
    >
      {queue.today.length === 0 ? (
        <div className="space-y-2 px-5 py-8 text-center">
          <CalendarClock className="text-faint mx-auto size-5" />
          <p className="text-faint text-sm">Nothing booked today.</p>
          {queue.next && (
            <p className="text-muted-foreground text-sm">
              Next: {queue.next.name ?? "no name"} ·{" "}
              {dayAndTime(queue.next.startsAt, timeZone)}
            </p>
          )}
        </div>
      ) : (
        <div className="divide-y">
          {queue.today.map((call) => (
            <CallRow
              key={call.id}
              call={call}
              isNext={call.id === nextId}
              timeZone={timeZone}
            />
          ))}
        </div>
      )}

      {/* Both notes only appear when there is something to say. */}
      {queue.today.length > 0 && !nextIsToday && queue.next && (
        <p className="text-faint border-t px-5 py-2.5 text-xs">
          Next: {queue.next.name ?? "no name"} ·{" "}
          {dayAndTime(queue.next.startsAt, timeZone)}
        </p>
      )}
      {queue.undated > 0 && (
        <p className="text-faint border-t px-5 py-2.5 text-xs">
          {queue.undated} booked with no time from the scheduler
        </p>
      )}
    </Panel>
  );
}
