import Link from "next/link";
import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  Coins,
  Gauge,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Panel, Row, Rows } from "@/components/ui/panel";
import { Kpi, Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { cents } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  type CoachModel,
  type CoachRate,
  type RateDelta,
} from "@/lib/home/coach-model";

/**
 * The manager's home ("Coach"): their offers' sales world, scoped — cash and
 * deals this month, quota pacing, EOD compliance, the close/show-rate trend, and
 * the top and bottom rep. Zero accounting, by design: no payout, no partner
 * split. Every figure is real or an honest empty state.
 */

const DELTA_ICON: Record<RateDelta, typeof TrendingUp> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};
const DELTA_TONE: Record<RateDelta, string> = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-faint",
};

function pct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}

function RateBlock({ label, rate }: { label: string; rate: CoachRate }) {
  const Icon = rate.delta ? DELTA_ICON[rate.delta] : null;
  return (
    <div className="space-y-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-baseline gap-2">
        <p className="numeric text-2xl leading-none font-semibold">{pct(rate.rate)}</p>
        {Icon && rate.delta && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs",
              DELTA_TONE[rate.delta],
            )}
          >
            <Icon className="size-3.5" />
            {rate.delta === "flat" ? "flat" : rate.delta === "up" ? "up" : "down"} vs
            last mo
          </span>
        )}
      </div>
    </div>
  );
}

function RepLine({
  label,
  icon: Icon,
  tone,
  name,
  teamName,
  cashCents,
  dealsClosed,
}: {
  label: string;
  icon: typeof Trophy;
  tone: string;
  name: string;
  teamName: string | null;
  cashCents: number;
  dealsClosed: number;
}) {
  return (
    <Row>
      <Icon className={cn("size-4 shrink-0", tone)} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-faint text-xs">
          {label}
          {teamName ? ` · ${teamName}` : ""}
        </p>
      </div>
      <div className="ml-auto text-right">
        <Money amount={cents(cashCents)} className="text-sm font-semibold" />
        <p className="text-faint text-xs">
          {dealsClosed} {dealsClosed === 1 ? "deal" : "deals"}
        </p>
      </div>
    </Row>
  );
}

const QUICK_LINKS = [
  { label: "Leaderboard", href: "/sales/leaderboard", icon: BarChart3 },
  { label: "Quotas", href: "/sales/quotas", icon: Target },
  { label: "EOD reports", href: "/sales/eod", icon: ClipboardList },
  { label: "Deals", href: "/sales", icon: Coins },
];

export function CoachHome({
  model,
  viewerName,
}: {
  model: CoachModel;
  viewerName: string;
}) {
  const { offers, quota, eodToday, eodWeek, closeRate, showRate, topRep, bottomRep } =
    model;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Your"
        highlight="floor."
        description="Your offers' sales engine this month — pacing, EODs, and who needs a nudge. Accounting lives with the admins."
        status={
          <StatusPill tone="live">
            {offers.isAllOffers ? "All offers" : offers.scopeLabel}
          </StatusPill>
        }
      />

      {!model.hasReps ? (
        <Panel title="No reps on your floor yet">
          <p className="text-faint py-8 text-center text-sm">
            Reps are added under each offer&apos;s team config (Sales → Teams). Once
            they are on, {viewerName ? `${viewerName}'s ` : "your "}
            cash, pacing, and EOD compliance light up here — all from real rows.
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Cash collected · this month"
              value={<Money amount={cents(offers.cashCents)} />}
              icon={Coins}
              tone="success"
            />
            <Kpi
              label="Deals closed · this month"
              value={offers.dealsClosed.toLocaleString("en-US")}
              icon={Coins}
            />
            <Kpi
              label="Close rate"
              value={pct(closeRate.rate)}
              icon={Gauge}
              tone="brand"
            />
            <Kpi
              label="EODs filed today"
              value={`${eodToday.submitted}/${eodToday.total}`}
              icon={CalendarCheck}
              tone={eodToday.missing.length === 0 ? "success" : "warning"}
            />
          </div>

          <Panel title="Quota pacing">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="Active quotas"
                value={String(quota.total)}
                icon={Target}
                tone="brand"
              />
              <Kpi
                label="Ahead of pace"
                value={String(quota.ahead)}
                icon={TrendingUp}
                tone="success"
              />
              <Kpi label="On track" value={String(quota.onTrack)} icon={Gauge} />
              <Kpi
                label="Behind pace"
                value={String(quota.behind)}
                icon={TrendingDown}
                tone="danger"
              />
            </div>
            {quota.total === 0 ? (
              <p className="text-faint mt-5 border-t pt-4 text-sm">
                No quotas set for your offers yet.{" "}
                <Link href="/sales/quotas/new" className="text-brand">
                  Create one
                </Link>{" "}
                and GV OS paces it against real numbers.
              </p>
            ) : quota.repsBehind.length > 0 ? (
              <div className="mt-5 border-t pt-4">
                <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
                  Reps behind pace
                </p>
                <Rows>
                  {quota.repsBehind.map((r, i) => (
                    <Row key={`${r.name}-${r.metricLabel}-${i}`}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="text-faint text-xs">
                          {r.metricLabel}
                          {r.teamName ? ` · ${r.teamName}` : ""}
                        </p>
                      </div>
                      <StatusPill tone="danger" className="ml-auto">
                        {pct(r.attainmentPct)} of target
                      </StatusPill>
                    </Row>
                  ))}
                </Rows>
              </div>
            ) : (
              <p className="text-success mt-5 border-t pt-4 text-sm">
                Every rep with a quota is on or ahead of pace.
              </p>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Top & bottom rep"
              aside={<Users className="text-faint size-4" />}
            >
              {topRep ? (
                <Rows>
                  <RepLine
                    label="Top rep"
                    icon={Trophy}
                    tone="text-success"
                    name={topRep.name}
                    teamName={topRep.teamName}
                    cashCents={topRep.cashCents}
                    dealsClosed={topRep.dealsClosed}
                  />
                  {bottomRep && (
                    <RepLine
                      label="Needs a nudge"
                      icon={TrendingDown}
                      tone="text-warning"
                      name={bottomRep.name}
                      teamName={bottomRep.teamName}
                      cashCents={bottomRep.cashCents}
                      dealsClosed={bottomRep.dealsClosed}
                    />
                  )}
                </Rows>
              ) : (
                <p className="text-faint py-8 text-center text-sm">
                  No ranked reps yet — the board fills in as cash and deals come in.
                </p>
              )}
            </Panel>

            <Panel title="Show & close rate">
              <div className="grid grid-cols-2 gap-6">
                <RateBlock label="Show rate" rate={showRate} />
                <RateBlock label="Close rate" rate={closeRate} />
              </div>
              <p className="text-faint mt-4 border-t pt-4 text-xs">
                Show rate is shows ÷ resolved calls; close rate is deals ÷ shows. Both
                from submitted EODs and closed deals this month.
              </p>
            </Panel>
          </div>

          <Panel
            title="EOD compliance"
            aside={
              <span className="text-faint text-xs">
                {eodWeek.submitted}/{eodWeek.total} filed this week
              </span>
            }
          >
            {eodToday.missing.length === 0 ? (
              <p className="text-success text-sm">
                All {eodToday.total} reps filed their EOD today.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">{eodToday.missing.length}</span> still
                  owe an EOD today:
                </p>
                <div className="flex flex-wrap gap-2">
                  {eodToday.missing.map((name) => (
                    <StatusPill key={name} tone="progress">
                      {name}
                    </StatusPill>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="card-grad hover-lift hover:border-brand/40 flex items-center gap-2.5 rounded-lg border p-4 text-sm font-medium"
              >
                <l.icon className="text-faint size-4" />
                {l.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
