import { Gauge } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import { dailyBrief } from "@/lib/brief/daily-brief";
import { monthPace } from "@/lib/brief/pace";
import { cents } from "@/lib/money";
import { getEodCompliance, listDeals } from "@/lib/sales/queries";
import { listCallLogs } from "@/lib/sales/call-queries";
import { getSettings } from "@/lib/settings";
import { homeRangeHeadline, rangeBounds } from "@/lib/transactions/homepage";
import { listTransactions } from "@/lib/transactions/queries";
import { dayKeyIn } from "@/lib/time/zone";
import { viewerTimeZone } from "@/lib/time/viewer-zone";
import { refreshProvidersOnView } from "@/lib/integrations/refresh-on-view";

export const metadata = { title: "Daily brief - GV OS" };
export const dynamic = "force-dynamic";

const PACE_TONE: Record<string, StatusTone> = {
  ahead: "live",
  on_track: "good",
  behind: "danger",
  no_goal: "muted",
};
const PACE_LABEL: Record<string, string> = {
  ahead: "Ahead of pace",
  on_track: "On track",
  behind: "Behind pace",
  no_goal: "No goal set",
};

/**
 * The morning read: the month's cash against its goal, then the six figures
 * that say whether today has started and yesterday finished.
 *
 * It used to also carry Needs attention, Team check-ins, Speed to lead and
 * Behind on quota — four panels that took a scroll to get through and each
 * had a page of their own that did the job better. They are gone, along with
 * the five queries that fed only them.
 */
export default async function BriefPage() {
  // Live when you are looking: stale feeds pull after the response goes.
  refreshProvidersOnView(["stripe", "iclosed", "calendly", "close"]);
  const tz = await viewerTimeZone();
  const now = new Date();
  const todayKey = dayKeyIn(now, tz);
  const [y, m, d] = todayKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const [{ rows: backlog }, settings, deals, eod, bod, calls] = await Promise.all([
    listTransactions({}),
    getSettings(),
    listDeals(),
    getEodCompliance("eod"),
    getEodCompliance("bod"),
    listCallLogs(),
  ]);

  // The month's cash against its goal — the figure the whole month is read on.
  const monthBounds = rangeBounds("month", todayKey);
  const headline = homeRangeHeadline(backlog, "all", monthBounds);
  const goalCents = settings.monthlyRevenueGoalCents ?? 0;
  const pace = monthPace(headline.collectedCents, goalCents, d, daysInMonth);

  // Cash is the agency's own collected rows, on the day they landed. Deals and
  // calls carry their own dates; every one is bucketed in the viewer's zone so
  // "yesterday" means the day they lived through, not a UTC boundary.
  const tiles = dailyBrief(
    {
      cash: backlog
        .filter((r) => r.layer === "agency" && r.direction === "in")
        .map((r) => ({ day: r.occurredOn, cents: r.cashCents })),
      deals: deals
        .filter((dl) => dl.closedAt)
        .map((dl) => ({ day: dayKeyIn(dl.closedAt!, tz) })),
      calls: calls.map((c) => ({ day: dayKeyIn(c.occurredAt, tz) })),
      bod: { submitted: bod.submitted, total: bod.total },
      eod: { submitted: eod.submitted, total: eod.total },
    },
    todayKey,
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Daily"
        highlight="brief."
        status={
          <StatusPill tone={PACE_TONE[pace.status]}>
            {PACE_LABEL[pace.status]}
          </StatusPill>
        }
      />

      <section className="card-grad elev-glow rounded-xl border p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-faint flex items-center gap-2 text-[11px] font-medium tracking-wider uppercase">
              <Gauge className="size-3.5" /> Cash collected this month
            </p>
            <p className="numeric text-success mt-1 text-4xl font-bold tracking-tight sm:text-5xl">
              <Money amount={cents(headline.collectedCents)} />
            </p>
            {goalCents > 0 ? (
              <p className="text-muted-foreground mt-1 text-sm">
                {pace.pct}% of <Money amount={cents(goalCents)} /> goal · projecting{" "}
                <span className="text-foreground font-medium">
                  <Money amount={cents(pace.projectedCents)} />
                </span>{" "}
                ({pace.projectedPct}%)
              </p>
            ) : (
              <p className="text-faint mt-1 text-sm">
                Set a monthly goal in Settings to track pace.
              </p>
            )}
          </div>
          {goalCents > 0 && (
            <div className="text-right">
              <p className="text-faint text-[11px] tracking-wider uppercase">
                Pace target today
              </p>
              <p className="numeric mt-1 text-xl font-semibold">
                <Money amount={cents(pace.onPaceCents)} />
              </p>
            </div>
          )}
        </div>
        {goalCents > 0 && (
          <div className="bg-secondary mt-4 h-2 w-full overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full ${
                pace.status === "behind" ? "bg-warning" : "bg-success"
              }`}
              style={{ width: `${Math.min(100, pace.pct)}%` }}
            />
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Kpi
            key={t.key}
            label={t.label}
            tone={t.kind === "money" ? "success" : "brand"}
            value={
              t.value === null ? (
                "—"
              ) : t.kind === "money" ? (
                <Money amount={cents(t.value)} />
              ) : t.kind === "ratio" ? (
                `${t.value} / ${t.of}`
              ) : (
                String(t.value)
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
