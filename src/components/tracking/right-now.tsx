import { CalendarClock, CheckCircle2, TriangleAlert } from "lucide-react";

import type { RightNow } from "@/lib/tracking/offer-metrics";
import { cn } from "@/lib/utils";

/**
 * RIGHT NOW — the offer's live call state as three tiles: what's ahead,
 * what's overdue with no outcome, and what's ahead AND confirmed. The
 * reference pattern: a dashboard should answer "what's happening right now",
 * not only "what happened". Counts come from the offer metrics engine, so
 * they always agree with the CRM page's stuck list.
 */
export function RightNowPanel({ rightNow }: { rightNow: RightNow }) {
  const tiles = [
    {
      label: "Upcoming calls",
      value: rightNow.upcoming,
      icon: CalendarClock,
      tone: "text-muted-foreground",
      hot: false,
    },
    {
      label: "Stuck — date passed",
      value: rightNow.stuck,
      icon: TriangleAlert,
      tone: "text-warning",
      hot: rightNow.stuck > 0,
    },
    {
      label: "Confirmed, awaiting call",
      value: rightNow.confirmedAwaiting,
      icon: CheckCircle2,
      tone: "text-success",
      hot: false,
    },
  ];
  return (
    <section className="bg-card rounded-xl border p-5">
      <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
        Right now
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={cn(
              "rounded-lg border p-3.5",
              t.hot ? "border-warning/40 bg-warning/5" : "bg-secondary/30",
            )}
          >
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <t.icon className={cn("size-3.5", t.tone)} /> {t.label}
            </p>
            <p className="text-foreground mt-1 font-mono text-2xl font-semibold tabular-nums">
              {t.value}
            </p>
          </div>
        ))}
      </div>
      <p className="text-faint mt-3 text-xs">
        From this offer&apos;s synced calendar. Confirmations count only when recorded
        before the call&apos;s start time.
      </p>
    </section>
  );
}
