import Link from "next/link";
import { desc, eq, isNull } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  Gauge,
  HeartPulse,
  Target,
  TrendingUp,
} from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import { Kpi, Money } from "@/components/ui/metric";
import { getDb } from "@/db/client";
import { clients, notifications } from "@/db/schema/app";
import { monthPace } from "@/lib/brief/pace";
import { dayKeyCT } from "@/lib/charts";
import { cents } from "@/lib/money";
import { computeSpeedToLead } from "@/lib/funnel/speed-to-lead";
import { listApplications } from "@/lib/funnel/queries";
import { listCallLogs } from "@/lib/sales/call-queries";
import { getEodCompliance, listActivityReports, listDeals } from "@/lib/sales/queries";
import { listQuotasWithPacing } from "@/lib/sales/quota-queries";
import { getSettings } from "@/lib/settings";
import { homeRangeHeadline, rangeBounds } from "@/lib/transactions/homepage";
import { listTransactions } from "@/lib/transactions/queries";

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
const SEV_TONE: Record<string, StatusTone> = {
  critical: "danger",
  warning: "progress",
  info: "good",
};

export default async function BriefPage() {
  const now = new Date();
  const todayKey = dayKeyCT(now);
  const yesterdayKey = dayKeyCT(new Date(now.getTime() - 86_400_000));
  const [y, m, d] = todayKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const db = getDb();

  const [
    { rows: backlog },
    settings,
    deals,
    compliance,
    eodReports,
    apps,
    calls,
    quotas,
    alertRows,
  ] = await Promise.all([
    listTransactions({}),
    getSettings(),
    listDeals(),
    getEodCompliance(),
    listActivityReports("eod"),
    listApplications(),
    listCallLogs(),
    listQuotasWithPacing(now.getTime()),
    db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        severity: notifications.severity,
        title: notifications.title,
        clientName: clients.name,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(clients, eq(notifications.clientId, clients.id))
      .where(isNull(notifications.readAt))
      .orderBy(desc(notifications.createdAt))
      .limit(60),
  ]);

  // 1) Cash pace — agency MTD cash vs the monthly goal, projected to month-end.
  const monthBounds = rangeBounds("month", todayKey);
  const headline = homeRangeHeadline(backlog, "all", monthBounds);
  const goalCents = settings.monthlyRevenueGoalCents ?? 0;
  const pace = monthPace(headline.collectedCents, goalCents, d, daysInMonth);

  // 2) Yesterday — deals closed + applications in.
  const yDeals = deals.filter(
    (dl) => dl.closedAt && dayKeyCT(dl.closedAt) === yesterdayKey,
  );
  const yDealCash = yDeals.reduce((s, dl) => s + dl.cashCollectedCents, 0);
  const yApps = apps.filter(
    (a) => dayKeyCT(a.submittedAt ?? a.createdAt) === yesterdayKey,
  ).length;

  // 3) Wellbeing — today's EOD check-ins below 3.
  const lowMood = eodReports
    .filter((r) => dayKeyCT(new Date(r.reportDate)) === todayKey)
    .map((r) => ({
      repName: r.repName,
      teamName: r.teamName,
      mood: Number((r.metrics as Record<string, number>)?.mood ?? 0),
    }))
    .filter((r) => r.mood >= 1 && r.mood < 3);

  // 4) Speed to lead — real time-to-first-dial, matched by email.
  const stl = computeSpeedToLead(
    apps.map((a) => ({
      email: a.email,
      submittedAtMs: (a.submittedAt ?? a.createdAt).getTime(),
    })),
    calls.map((c) => ({
      email: c.customerEmail,
      occurredAtMs: c.occurredAt.getTime(),
    })),
  );

  // 5) Quota laggards + top alerts.
  const behind = quotas.filter((q) => q.pacing.status === "behind" && !q.isPast);
  const SEV_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const alerts = [...alertRows]
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3))
    .slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Daily"
        highlight="brief."
        description={`What needs your attention — ${new Date(
          `${todayKey}T12:00:00Z`,
        ).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}.`}
        status={
          <StatusPill tone={PACE_TONE[pace.status]}>
            {PACE_LABEL[pace.status]}
          </StatusPill>
        }
      />

      {/* Cash pace — the headline the whole month is measured against. */}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Deals yesterday"
          value={String(yDeals.length)}
          icon={TrendingUp}
          tone="brand"
        />
        <Kpi
          label="Cash yesterday"
          value={<Money amount={cents(yDealCash)} />}
          tone="success"
        />
        <Kpi label="Applications yesterday" value={String(yApps)} icon={ArrowRight} />
        <Kpi
          label="EODs in today"
          value={`${compliance.submitted} / ${compliance.total}`}
          icon={CalendarCheck}
          tone={compliance.missing.length > 0 ? "warning" : "success"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Needs attention — the alerts, most severe first. */}
        <Panel
          title="Needs attention"
          aside={
            <StatusPill tone={alerts.length ? "danger" : "good"}>
              {alerts.length || "0"}
            </StatusPill>
          }
        >
          {alerts.length === 0 ? (
            <p className="text-faint py-6 text-center text-sm">
              Nothing flagged — you&apos;re clear.
            </p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className="bg-card flex items-center gap-3 rounded-lg border p-2.5"
                >
                  <StatusPill tone={SEV_TONE[a.severity] ?? "muted"}>
                    {a.severity}
                  </StatusPill>
                  <span className="min-w-0 flex-1 truncate text-sm">{a.title}</span>
                  {a.clientName && (
                    <span className="text-muted-foreground rounded-full border px-1.5 text-[11px]">
                      {a.clientName}
                    </span>
                  )}
                </div>
              ))}
              <Link
                href="/notifications"
                className="text-brand inline-flex items-center gap-1 pt-1 text-xs hover:underline"
              >
                All notifications <ArrowRight className="size-3" />
              </Link>
            </div>
          )}
        </Panel>

        {/* Team check-ins — who hasn't filed + who's running low. */}
        <Panel title="Team check-ins">
          <div className="space-y-4">
            <div>
              <p className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                <CalendarCheck className="size-3.5" /> EOD not in yet
              </p>
              {compliance.missing.length === 0 ? (
                <p className="text-success text-sm">Everyone&apos;s in. ✓</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {compliance.missing.map((name) => (
                    <span
                      key={name}
                      className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t pt-3">
              <p className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                <HeartPulse className="size-3.5" /> Low check-ins today
              </p>
              {lowMood.length === 0 ? (
                <p className="text-faint text-sm">No one flagged a rough day.</p>
              ) : (
                <div className="space-y-1">
                  {lowMood.map((r) => (
                    <div
                      key={`${r.repName}-${r.teamName}`}
                      className="text-warning flex items-center gap-2 text-sm"
                    >
                      <AlertTriangle className="size-3.5 shrink-0" />
                      <span className="font-medium">{r.repName ?? "A rep"}</span>
                      <span className="text-faint text-xs">
                        {r.mood}/5{r.teamName ? ` · ${r.teamName}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* Quota laggards. */}
        <Panel
          title="Behind on quota"
          aside={
            <StatusPill tone={behind.length ? "progress" : "good"}>
              {behind.length}
            </StatusPill>
          }
        >
          {behind.length === 0 ? (
            <p className="text-faint py-6 text-center text-sm">
              No one&apos;s behind pace. <Target className="inline size-3.5" />
            </p>
          ) : (
            <div className="space-y-1.5">
              {behind.slice(0, 6).map((q) => (
                <div
                  key={q.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {q.repName ?? q.teamName}
                    <span className="text-faint ml-1.5 text-xs">{q.metricLabel}</span>
                  </span>
                  <span className="text-warning text-xs font-medium">
                    {q.pacing.attainmentPct}%
                  </span>
                </div>
              ))}
              <Link
                href="/sales/quotas"
                className="text-brand inline-flex items-center gap-1 pt-1 text-xs hover:underline"
              >
                All quotas <ArrowRight className="size-3" />
              </Link>
            </div>
          )}
        </Panel>

        {/* Speed to lead. */}
        <Panel title="Speed to lead">
          {stl.matched === 0 ? (
            <p className="text-faint py-6 text-center text-sm">
              <Gauge className="mr-1 inline size-4" /> No dials logged against leads
              yet.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Kpi
                label="Median dial"
                value={stl.medianMinutes === null ? "—" : `${stl.medianMinutes}m`}
                tone="brand"
              />
              <Kpi
                label="Within 5m"
                value={stl.slaPct === null ? "—" : `${Math.round(stl.slaPct * 100)}%`}
                tone={stl.slaPct !== null && stl.slaPct >= 0.8 ? "success" : "warning"}
              />
              <Kpi
                label="Over 60m"
                value={String(stl.over60)}
                tone={stl.over60 > 0 ? "danger" : "default"}
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
