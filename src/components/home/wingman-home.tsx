import Link from "next/link";
import { ArrowRight, CalendarPlus, Coins, PhoneCall, Target } from "lucide-react";

import { ActivityHeatmap } from "@/components/gamification/activity-heatmap";
import { PbCountBadge } from "@/components/gamification/personal-bests";
import { StreakBadge } from "@/components/gamification/streak-badge";
import { buttonVariants } from "@/components/ui/button";
import { Panel, Row, Rows } from "@/components/ui/panel";
import { Money } from "@/components/ui/metric";
import { StatusPill } from "@/components/ui/status";
import { formatDayKey } from "@/lib/gamification/engine";
import { cents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/team-roles";
import { type WingmanData } from "@/lib/home/data";
import { type WingmanQuotaLine } from "@/lib/home/wingman-model";

/**
 * The rep's home ("Wingman"): their own day at a glance — quota pace, streak and
 * personal bests, the commission they are owed, recent work, and a way straight
 * into logging the next call or EOD. Every figure is derived from real rows, so a
 * rep with no history sees an honest empty state, never a wall of zeros.
 */

const STATUS_BAR: Record<WingmanQuotaLine["status"], string> = {
  ahead: "bg-success",
  on_track: "bg-brand",
  behind: "bg-destructive",
};
const STATUS_TONE = {
  ahead: "good",
  on_track: "live",
  behind: "danger",
} as const;
const STATUS_LABEL: Record<WingmanQuotaLine["status"], string> = {
  ahead: "Ahead of pace",
  on_track: "On track",
  behind: "Behind pace",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function QuotaValue({ isMoney, amount }: { isMoney: boolean; amount: number }) {
  return isMoney ? (
    <Money amount={cents(amount)} className="text-sm font-semibold" />
  ) : (
    <span className="numeric text-sm font-semibold">
      {amount.toLocaleString("en-US")}
    </span>
  );
}

function QuotaLine({ line }: { line: WingmanQuotaLine }) {
  const width = Math.min(100, Math.max(0, Math.round(line.attainmentPct * 100)));
  return (
    <div className="space-y-2.5 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{line.metricLabel}</span>
        <StatusPill tone={STATUS_TONE[line.status]} className="ml-auto">
          {STATUS_LABEL[line.status]}
        </StatusPill>
      </div>
      <div className="bg-secondary h-2 w-full overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full", STATUS_BAR[line.status])}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>
          <QuotaValue isMoney={line.isMoney} amount={line.soFar} /> of{" "}
          <QuotaValue isMoney={line.isMoney} amount={line.target} />
        </span>
        <span className="numeric">{pct(line.attainmentPct)} attained</span>
      </div>
    </div>
  );
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Chicago",
  });
}

export function WingmanHome({ data }: { data: WingmanData }) {
  const { rep, gamification, model, recentActivity, lastEods } = data;

  if (!rep) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your board</h1>
          <p className="text-muted-foreground text-sm">Your day, your numbers.</p>
        </div>
        <Panel title="No rep linked">
          <p className="text-faint py-8 text-center text-sm">
            This account isn&apos;t linked to an active sales rep yet. Once it is, your
            quota pace, streak, and commission show up here.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            {rep.name.split(" ")[0]}&apos;s{" "}
            <span className="text-gradient-brand">board.</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            {roleLabel(rep.role)}
            {rep.teamName ? ` · ${rep.teamName}` : ""}
          </p>
        </div>
        <StreakBadge days={model.streak.current} />
        <PbCountBadge count={model.pbCount} />
      </div>

      <Panel
        title="Your quota pace"
        aside={
          model.primaryAttainmentPct !== null ? (
            <span className="numeric text-faint text-xs">
              {pct(model.primaryAttainmentPct)} of target
            </span>
          ) : undefined
        }
        padded={false}
      >
        {model.hasQuotas ? (
          <div className="bg-border flex flex-col gap-px">
            {model.quotaLines.map((line) => (
              <div key={line.id} className="bg-card">
                <QuotaLine line={line} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-faint p-8 text-center text-sm">
            No quota assigned to you yet. When your manager sets one, GV OS paces it
            against your real numbers here.
          </p>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Commission owed" aside={<Coins className="text-faint size-4" />}>
          {model.commission ? (
            <div className="space-y-4">
              <div>
                <Money
                  amount={cents(model.commission.owedCents)}
                  className="text-3xl font-semibold"
                />
                <div className="mt-2 flex items-center gap-2">
                  <StatusPill tone={model.commission.paid ? "good" : "progress"}>
                    {model.commission.paid ? "Paid" : "Owed"}
                  </StatusPill>
                  <span className="text-faint text-xs">
                    {model.commission.deals}{" "}
                    {model.commission.deals === 1 ? "deal" : "deals"} ·{" "}
                    {model.commission.period}
                  </span>
                </div>
              </div>
              <Rows>
                <Row>
                  <span className="text-muted-foreground text-sm">Commission</span>
                  <Money
                    amount={cents(model.commission.commissionCents)}
                    className="ml-auto text-sm"
                  />
                </Row>
                {model.commission.baseCents > 0 && (
                  <Row>
                    <span className="text-muted-foreground text-sm">Base</span>
                    <Money
                      amount={cents(model.commission.baseCents)}
                      className="ml-auto text-sm"
                    />
                  </Row>
                )}
                {model.commission.bonusCents > 0 && (
                  <Row>
                    <span className="text-muted-foreground text-sm">Bonus</span>
                    <Money
                      amount={cents(model.commission.bonusCents)}
                      className="ml-auto text-sm"
                    />
                  </Row>
                )}
                {model.commission.skimCents > 0 && (
                  <Row>
                    <span className="text-muted-foreground text-sm">Team override</span>
                    <Money
                      amount={cents(model.commission.skimCents)}
                      className="ml-auto text-sm"
                    />
                  </Row>
                )}
              </Rows>
            </div>
          ) : (
            <p className="text-faint py-8 text-center text-sm">
              No commission on the board yet. Close a deal and your owed number builds
              up here from the ledger.
            </p>
          )}
        </Panel>

        <Panel title="Quick actions" aside={<Target className="text-faint size-4" />}>
          <div className="grid gap-3">
            <Link
              href="/sales/call-log/new"
              className={cn(buttonVariants({ size: "sm" }), "justify-start gap-2")}
            >
              <PhoneCall className="size-4" /> Log a call
            </Link>
            <Link
              href="/sales/eod/submit"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "justify-start gap-2",
              )}
            >
              <CalendarPlus className="size-4" /> Submit EOD
            </Link>
            <Link
              href={`/home/member/${rep.id}`}
              className="text-brand mt-1 inline-flex items-center gap-1.5 text-sm"
            >
              Full momentum <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Panel>
      </div>

      {gamification && gamification.hasActivity && (
        <Panel title="Your activity">
          <ActivityHeatmap heatmap={gamification.heatmap} />
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent activity" padded={false}>
          {recentActivity.length > 0 ? (
            <Rows>
              {recentActivity.map((a) => (
                <Row key={a.id}>
                  <PhoneCall className="text-faint size-3.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{a.title}</p>
                    {a.sub && <p className="text-faint truncate text-xs">{a.sub}</p>}
                  </div>
                  <span className="text-faint ml-auto text-xs">
                    {shortDate(a.occurredAt)}
                  </span>
                </Row>
              ))}
            </Rows>
          ) : (
            <p className="text-faint p-8 text-center text-sm">
              No logged calls yet.{" "}
              <Link href="/sales/call-log/new" className="text-brand">
                Log your first
              </Link>
              .
            </p>
          )}
        </Panel>

        <Panel title="Last EODs" padded={false}>
          {lastEods.length > 0 ? (
            <Rows>
              {lastEods.map((e) => (
                <Row key={e.id}>
                  <span className="text-faint w-16 text-xs">
                    {formatDayKey(e.dayKey)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {e.dials} dials · {e.setsBooked} sets · {e.shows} shows
                  </span>
                </Row>
              ))}
            </Rows>
          ) : (
            <p className="text-faint p-8 text-center text-sm">
              No EODs filed yet.{" "}
              <Link href="/sales/eod/submit" className="text-brand">
                Submit today&apos;s
              </Link>
              .
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
