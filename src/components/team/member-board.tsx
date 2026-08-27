"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckSquare,
  ClipboardCheck,
  Eye,
  Link2,
  Mail,
  Send,
  Tag,
  Target,
  Unlink,
  Users,
  Wallet,
} from "lucide-react";

import { linkMemberToRep } from "@/app/(app)/team/actions";
import { ActivityHeatmap } from "@/components/gamification/activity-heatmap";
import { PbCountBadge, PersonalBests } from "@/components/gamification/personal-bests";
import { StreakBadge } from "@/components/gamification/streak-badge";
import { MemberAvatar } from "@/components/team/member-avatar";
import { Button } from "@/components/ui/button";
import { Kpi, Money } from "@/components/ui/metric";
import { Panel, Row, Rows } from "@/components/ui/panel";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { cents } from "@/lib/money";
import { baseFieldLabel } from "@/lib/sales/eod-fields";
import { type PaceStatus } from "@/lib/sales/quota-pacing";
import type {
  LinkableRep,
  MemberActivityRow,
  MemberCommission,
  MemberProfile,
} from "@/lib/team";
import type { QuotaRow } from "@/lib/sales/quota-queries";
import type {
  MemberEmailCard,
  MemberEodSummary,
  MemberWorkItem,
} from "@/lib/team-profile";
import { memberRoleLabel, roleLabel } from "@/lib/team-roles";
import { cn } from "@/lib/utils";

interface MemberOption {
  id: string;
  name: string;
  role: string;
}

const selectClass =
  "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const PACE: Record<PaceStatus, { label: string; tone: StatusTone; bar: string }> = {
  ahead: { label: "Ahead", tone: "good", bar: "bg-success" },
  on_track: { label: "On track", tone: "live", bar: "bg-brand" },
  behind: { label: "Behind", tone: "danger", bar: "bg-destructive" },
};

const WORK_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  not_started: { label: "To do", dot: "bg-faint", text: "text-muted-foreground" },
  in_progress: { label: "In progress", dot: "bg-warning", text: "text-warning" },
  completed: { label: "Done", dot: "bg-success", text: "text-success" },
};

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const fmtDay = (s: string) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** A small figure tile, in the metric-tile idiom used across the app. */
function StatTile({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix: string;
}) {
  return (
    <div className="card-grad elev-card rounded-xl border p-5">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        {label}
      </p>
      <p className="numeric mt-3 text-2xl leading-none font-semibold">
        {value.toLocaleString()}
        <span className="text-faint ml-1.5 text-sm font-normal">{suffix}</span>
      </p>
    </div>
  );
}

/** A headline tile that takes any node (money, ratio, count) plus a caption. */
function HeroTile({
  label,
  value,
  sub,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "default" | "brand";
  icon: typeof Wallet;
}) {
  return (
    <div className="card-grad elev-card rounded-xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          {label}
        </p>
        <span className="bg-secondary text-faint grid size-6 shrink-0 place-items-center rounded-md border">
          <Icon className="size-3.5" />
        </span>
      </div>
      <p
        className={cn(
          "numeric mt-3 text-2xl leading-none font-semibold",
          tone === "brand" && "text-brand",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-faint mt-1.5 text-xs">{sub}</p>}
    </div>
  );
}

function QuotaLine({ q }: { q: QuotaRow }) {
  const width = Math.min(100, Math.max(0, Math.round(q.pacing.attainmentPct * 100)));
  const value = (n: number) =>
    q.isMoney ? (
      <Money amount={cents(n)} />
    ) : (
      <span className="numeric">{n.toLocaleString("en-US")}</span>
    );
  return (
    <Row>
      <div className="mr-auto min-w-0">
        <p className="truncate text-sm font-medium">{q.metricLabel}</p>
        <p className="text-faint text-xs">
          {value(q.actualSoFar)} of {value(q.targetAmount)}
        </p>
      </div>
      <div className="bg-secondary hidden h-1.5 w-20 overflow-hidden rounded-full sm:block">
        <div
          className={cn("h-full rounded-full", PACE[q.pacing.status].bar)}
          style={{ width: `${width}%` }}
        />
      </div>
      <StatusPill tone={PACE[q.pacing.status].tone}>
        {PACE[q.pacing.status].label}
      </StatusPill>
    </Row>
  );
}

function RepLink({
  memberId,
  linkableReps,
}: {
  memberId: string;
  linkableReps: LinkableRep[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [repId, setRepId] = useState(linkableReps[0]?.id ?? "");

  if (linkableReps.length === 0) {
    return (
      <p className="text-faint py-6 text-center text-sm">
        No unlinked sales rep in this lane to connect. Create the rep in Sales first,
        then link it here to light up quotas, momentum, and commission.
      </p>
    );
  }

  function link() {
    if (!repId) return;
    start(async () => {
      try {
        await linkMemberToRep(memberId, repId);
        toast({ tone: "success", title: "Linked to sales rep" });
        router.refresh();
      } catch (e) {
        toast({
          tone: "error",
          title: "Couldn't link",
          detail: e instanceof Error ? e.message : undefined,
        });
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Link this member to their sales rep record and their profile pulls in quotas,
        momentum, and commission owed — the same numbers the leaderboard reads.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">Sales rep</span>
          <select
            className={cn(selectClass, "w-56")}
            value={repId}
            onChange={(e) => setRepId(e.target.value)}
          >
            {linkableReps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {roleLabel(r.role)}
                {r.teamName ? ` · ${r.teamName}` : ""}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={link} disabled={pending || !repId} className="gap-2">
          <Link2 className="size-3.5" /> Link rep
        </Button>
      </div>
    </div>
  );
}

function UnlinkButton({ memberId }: { memberId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await linkMemberToRep(memberId, null);
            toast({ tone: "success", title: "Unlinked from sales rep" });
            router.refresh();
          } catch (e) {
            toast({
              tone: "error",
              title: e instanceof Error ? e.message : "Action failed.",
            });
          }
        })
      }
      className="text-faint hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors"
    >
      <Unlink className="size-3" /> Unlink
    </button>
  );
}

function ActivityList({ rows }: { rows: MemberActivityRow[] }) {
  return (
    <Rows>
      {rows.map((r) => (
        <Row key={r.id}>
          <span className="text-sm font-medium">{r.title}</span>
          {r.sub && <span className="text-muted-foreground text-xs">{r.sub}</span>}
          <span className="text-faint ml-auto text-xs">{fmtDate(r.occurredAt)}</span>
        </Row>
      ))}
    </Rows>
  );
}

function CommissionPanel({ c }: { c: MemberCommission }) {
  return (
    <Panel
      title="Commission owed"
      aside={
        <StatusPill tone={c.paid ? "good" : "pending"}>
          {c.paid ? "Paid" : "Unpaid"} · {c.period}
        </StatusPill>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total owed"
          value={<Money amount={cents(c.owedCents)} />}
          tone="brand"
        />
        <Kpi label="Commission" value={<Money amount={cents(c.commissionCents)} />} />
        <Kpi
          label="Base + bonus"
          value={<Money amount={cents(c.baseCents + c.bonusCents)} />}
        />
        <Kpi label="Deals" value={c.deals.toLocaleString("en-US")} />
      </div>
      {c.skimCents > 0 && (
        <p className="text-muted-foreground mt-4 text-xs">
          Includes a top-line skim of <Money amount={cents(c.skimCents)} /> across the
          team.
        </p>
      )}
    </Panel>
  );
}

/** Non-zero activity metrics as compact chips, labelled from the field vocab. */
function MetricChips({ metrics }: { metrics: Record<string, number> }) {
  const entries = Object.entries(metrics)
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .slice(0, 6);
  if (entries.length === 0) {
    return <span className="text-faint text-xs">No activity logged</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="bg-secondary/60 text-muted-foreground inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
        >
          <span className="numeric text-foreground font-semibold">
            {v.toLocaleString()}
          </span>
          {baseFieldLabel(k)}
        </span>
      ))}
    </div>
  );
}

/** The member's EOD/BOD standing: a compliance read plus a submissions timeline. */
function EodPanel({ eod, memberName }: { eod: MemberEodSummary; memberName: string }) {
  const hasReports = eod.reports.length > 0;
  const asideTone: StatusTone = eod.filedLatestDay
    ? "good"
    : eod.lastEodAt
      ? "progress"
      : "muted";
  const asideLabel = eod.filedLatestDay
    ? "Up to date"
    : eod.lastEodAt
      ? "Behind"
      : "No EOD yet";

  return (
    <Panel
      title="EOD / BOD activity"
      aside={
        <StatusPill tone={asideTone}>
          {asideLabel}
          {eod.latestEodDay ? ` · team ${fmtDate(eod.latestEodDay)}` : ""}
        </StatusPill>
      }
      padded={!hasReports}
    >
      {!hasReports ? (
        <p className="text-faint py-6 text-center text-sm">
          No EOD or BOD filed yet. Once {memberName} submits their first report, their
          activity and compliance show here.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="EOD filed" value={eod.eodCount} suffix="recent" />
            <StatTile label="BOD filed" value={eod.bodCount} suffix="recent" />
            <div className="card-grad elev-card col-span-2 rounded-xl border p-5 sm:col-span-1">
              <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                Last EOD
              </p>
              <p className="mt-3 text-lg leading-none font-semibold">
                {eod.lastEodAt ? fmtDate(eod.lastEodAt) : "—"}
              </p>
              {eod.lastBodAt && (
                <p className="text-faint mt-1.5 text-xs">
                  Last BOD {fmtDate(eod.lastBodAt)}
                </p>
              )}
            </div>
          </div>
          <Rows>
            {eod.reports.map((r) => (
              <Row
                key={r.id}
                className="flex-col items-start gap-2 sm:flex-row sm:items-center"
              >
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-1.5 text-[11px]",
                      r.kind === "bod"
                        ? "border-brand/30 text-brand"
                        : "text-muted-foreground",
                    )}
                  >
                    {r.kind === "bod" ? "BOD" : "EOD"}
                  </span>
                  <span className="text-faint text-xs">{fmtDate(r.reportDate)}</span>
                </div>
                <div className="min-w-0 sm:ml-2">
                  <MetricChips metrics={r.metrics} />
                  {r.notes && (
                    <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs">
                      {r.notes}
                    </p>
                  )}
                </div>
              </Row>
            ))}
          </Rows>
        </div>
      )}
    </Panel>
  );
}

/** Assigned work: a status summary plus the member's action items. */
function WorkPanel({
  items,
  summary,
  todayKey,
  memberName,
}: {
  items: MemberWorkItem[];
  summary: MemberProfile["workSummary"];
  todayKey: string;
  memberName: string;
}) {
  return (
    <Panel
      title="Assigned work"
      aside={
        summary.total > 0 ? (
          <div className="flex items-center gap-2">
            {summary.overdue > 0 && (
              <StatusPill tone="danger">{summary.overdue} overdue</StatusPill>
            )}
            <span className="text-faint text-xs">
              {summary.done}/{summary.total} done
            </span>
          </div>
        ) : undefined
      }
      padded={summary.total === 0}
    >
      {summary.total === 0 ? (
        <p className="text-faint py-6 text-center text-sm">
          Nothing assigned to {memberName}. Hand off an action item in Work and it lands
          here.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="To do" value={summary.toDo} suffix="open" />
            <StatTile label="In progress" value={summary.inProgress} suffix="active" />
            <StatTile label="Done" value={summary.done} suffix="closed" />
          </div>
          <Rows>
            {items.map((it) => {
              const meta = WORK_STATUS[it.status] ?? WORK_STATUS.not_started;
              const overdue =
                it.status !== "completed" &&
                it.dueDate !== null &&
                it.dueDate < todayKey;
              return (
                <Row key={it.id}>
                  <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
                  <div className="mr-auto min-w-0">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        it.status === "completed" && "text-faint line-through",
                      )}
                    >
                      {it.title}
                    </p>
                    <p className="text-faint text-xs">
                      {it.clientName ?? "Agency"} · {it.cadence}
                    </p>
                  </div>
                  {it.dueDate && (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 text-xs",
                        overdue ? "text-destructive" : "text-faint",
                      )}
                    >
                      {overdue ? (
                        <AlertTriangle className="size-3" />
                      ) : (
                        <CalendarClock className="size-3" />
                      )}
                      {fmtDay(it.dueDate)}
                    </span>
                  )}
                  <span className={cn("shrink-0 text-[11px]", meta.text)}>
                    {meta.label}
                  </span>
                </Row>
              );
            })}
          </Rows>
        </div>
      )}
    </Panel>
  );
}

/** A calm, static subscriber-growth sparkline — no glow, no animation. */
function MemberSparkline({ series }: { series: { at: Date; value: number }[] }) {
  if (series.length < 2) return null;
  const values = series.map((s) => s.value);
  const W = 240;
  const H = 48;
  const PAD = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const n = values.length;
  const x = (i: number) => PAD + (i / (n - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M ${x(0)},${H - PAD} L ${values
    .map((v, i) => `${x(i)},${y(v)}`)
    .join(" L ")} L ${x(n - 1)},${H - PAD} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-12 w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="gv-member-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#gv-member-spark)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(n - 1)} cy={y(values[n - 1])} r="2.5" fill="var(--brand)" />
    </svg>
  );
}

/** The member's client email account: list size, sequences, and its growth. */
function EmailPanel({ email }: { email: MemberEmailCard }) {
  const subs = email.subscriberCount;
  return (
    <Panel
      title="Email engine"
      aside={
        <div className="flex items-center gap-2">
          {email.plan && (
            <span className="text-muted-foreground rounded-full border px-1.5 text-[11px] capitalize">
              {email.plan}
            </span>
          )}
          <span className="text-faint text-xs">as of {fmtDate(email.takenAt)}</span>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <Kpi
            label="Subscribers"
            value={
              subs === null ? (
                <span className="text-faint">—</span>
              ) : (
                <span className="numeric">{subs.toLocaleString()}</span>
              )
            }
            icon={Users}
            tone="brand"
          />
          <Kpi
            label="Sequences"
            value={
              <span className="numeric">
                {email.activeSequences.toLocaleString()}
                <span className="text-faint text-sm font-normal">
                  {" "}
                  / {email.sequenceCount}
                </span>
              </span>
            }
            icon={Send}
          />
          <Kpi
            label="Tags"
            value={<span className="numeric">{email.tagCount.toLocaleString()}</span>}
            icon={Tag}
          />
        </div>
        <div className="border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <div className="flex items-baseline justify-between">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
              Subscriber growth
            </p>
            {email.netAdded !== null && (
              <span
                className={cn(
                  "numeric text-xs font-semibold",
                  email.netAdded > 0
                    ? "text-success"
                    : email.netAdded < 0
                      ? "text-destructive"
                      : "text-faint",
                )}
              >
                {email.netAdded > 0 ? "+" : ""}
                {email.netAdded.toLocaleString()}
              </span>
            )}
          </div>
          {email.series.length >= 2 ? (
            <>
              <MemberSparkline series={email.series} />
              <p className="text-faint mt-1 text-[11px]">
                since {email.firstAt ? fmtDate(email.firstAt) : "capture began"}
              </p>
            </>
          ) : (
            <p className="text-faint mt-3 text-xs">
              Growth builds once daily snapshots accumulate.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

/**
 * A member's profile: a person dashboard. The identity card up top, then — once
 * linked to a sales rep — their headline numbers, momentum, quotas, commission,
 * EOD/BOD compliance, and recent calls, all from the read layers that already
 * power Sales. Assigned work and their client's email engine show for every
 * member, linked or not. Numbers are never recomputed here: money and pacing
 * arrive already derived.
 */
export function MemberBoard({
  profile,
  members,
  linkableReps,
  nowMs,
}: {
  profile: MemberProfile;
  members: MemberOption[];
  linkableReps: LinkableRep[];
  nowMs: number;
}) {
  const router = useRouter();
  const {
    member,
    rep,
    momentum,
    quotas,
    commission,
    recentActivity,
    workItems,
    workSummary,
    eod,
    email,
  } = profile;
  const active = member.status === "active";
  const todayKey = new Date(nowMs).toISOString().slice(0, 10);
  const quotasOnPace = quotas.filter((q) => q.pacing.status !== "behind").length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/team"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" /> Roster
        </Link>
        <label className="inline-flex items-center gap-2">
          <Eye className="text-faint size-4" />
          <select
            aria-label="Jump to member"
            className={cn(selectClass, "w-44")}
            value={member.id}
            onChange={(e) => router.push(`/team/${e.target.value}`)}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {roleLabel(m.role)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Identity card */}
      <section className="card-grad elev-card overflow-hidden rounded-xl border p-6">
        <div className="flex flex-wrap items-start gap-5">
          <MemberAvatar name={member.name} size="xl" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={active ? "live" : "muted"}>
                {active ? "Active" : "Inactive"}
              </StatusPill>
              {rep && momentum?.hasActivity && (
                <>
                  <StreakBadge days={momentum.streak.current} />
                  <PbCountBadge count={momentum.personalBests.length} />
                </>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {member.name.split(" ")[0]}
                <span className="text-gradient-brand">&apos;s profile.</span>
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {memberRoleLabel(member)} · {member.clientName ?? "Agency-wide"} lane.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
              <span className="text-faint inline-flex items-center gap-1.5">
                <span className="text-muted-foreground">Lane</span>
                <span
                  className={cn(
                    "rounded-full border px-1.5 text-[11px]",
                    member.clientName
                      ? "text-muted-foreground"
                      : "border-brand/30 text-brand",
                  )}
                >
                  {member.clientName ?? "Agency"}
                </span>
              </span>
              <span className="text-faint inline-flex items-center gap-1.5">
                <span className="text-muted-foreground">Rep</span>
                {rep ? (
                  <span className="text-foreground inline-flex items-center gap-1">
                    <Link2 className="text-brand size-3" /> {rep.name}
                  </span>
                ) : (
                  <span className="text-faint">Not linked</span>
                )}
              </span>
              {member.email ? (
                <a
                  href={`mailto:${member.email}`}
                  className="text-muted-foreground hover:text-brand inline-flex items-center gap-1.5 transition-colors"
                >
                  <Mail className="size-3.5" /> {member.email}
                </a>
              ) : null}
            </div>
          </div>
        </div>
        {member.notes && (
          <p className="text-muted-foreground mt-5 border-t pt-4 text-sm">
            {member.notes}
          </p>
        )}
      </section>

      {/* Headline numbers */}
      {rep && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroTile
            label="Commission owed"
            value={
              commission ? (
                <Money amount={cents(commission.owedCents)} />
              ) : (
                <span className="text-faint">—</span>
              )
            }
            sub={commission ? `${commission.period} run` : "no payout line yet"}
            tone="brand"
            icon={Wallet}
          />
          <HeroTile
            label="Current streak"
            value={
              <>
                {(momentum?.streak.current ?? 0).toLocaleString()}
                <span className="text-faint ml-1.5 text-sm font-normal">days</span>
              </>
            }
            sub={`longest ${(momentum?.streak.longest ?? 0).toLocaleString()}`}
            icon={ClipboardCheck}
          />
          <HeroTile
            label="Quotas on pace"
            value={
              <>
                {quotasOnPace.toLocaleString()}
                <span className="text-faint ml-1.5 text-sm font-normal">
                  / {quotas.length}
                </span>
              </>
            }
            sub={quotas.length === 0 ? "none assigned" : "vs target"}
            icon={Target}
          />
          <HeroTile
            label="Open work"
            value={(workSummary.toDo + workSummary.inProgress).toLocaleString()}
            sub={
              workSummary.overdue > 0
                ? `${workSummary.overdue} overdue`
                : `${workSummary.done} done`
            }
            icon={CheckSquare}
          />
        </div>
      )}

      <Panel
        title="Sales rep link"
        aside={
          rep ? (
            <div className="flex items-center gap-2">
              <StatusPill tone="live">Linked</StatusPill>
              <UnlinkButton memberId={member.id} />
            </div>
          ) : (
            <StatusPill tone="muted">Not linked</StatusPill>
          )
        }
      >
        {rep ? (
          <p className="text-muted-foreground text-sm">
            Mapped to <span className="text-foreground font-medium">{rep.name}</span>
            {rep.teamName ? ` on ${rep.teamName}` : ""}. Quotas, momentum, and
            commission resolve to this rep.
          </p>
        ) : (
          <RepLink memberId={member.id} linkableReps={linkableReps} />
        )}
      </Panel>

      {rep && (
        <>
          <Panel
            title="Momentum"
            aside={
              momentum?.hasActivity ? (
                <div className="flex items-center gap-2">
                  <StreakBadge days={momentum.streak.current} />
                  <PbCountBadge count={momentum.personalBests.length} />
                </div>
              ) : undefined
            }
          >
            {!momentum || !momentum.hasActivity ? (
              <p className="text-faint py-6 text-center text-sm">
                No activity yet. Once {member.name} logs a call, files an EOD, or closes
                a deal, their streak, personal bests, and heatmap build up here.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatTile
                    label="Current streak"
                    value={momentum.streak.current}
                    suffix="days"
                  />
                  <StatTile
                    label="Longest streak"
                    value={momentum.streak.longest}
                    suffix="days"
                  />
                  <StatTile
                    label="Personal bests"
                    value={momentum.personalBests.length}
                    suffix="set"
                  />
                </div>
                <ActivityHeatmap heatmap={momentum.heatmap} />
                <PersonalBests bests={momentum.personalBests} />
              </div>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <Panel
              title="Quotas"
              aside={
                <span className="text-faint text-xs">{quotas.length} assigned</span>
              }
              padded={quotas.length === 0}
            >
              {quotas.length === 0 ? (
                <p className="text-faint py-6 text-center text-sm">
                  No quotas assigned to this rep. Set one in Sales and it paces here
                  against real numbers.
                </p>
              ) : (
                <Rows>
                  {quotas.map((q) => (
                    <QuotaLine key={q.id} q={q} />
                  ))}
                </Rows>
              )}
            </Panel>

            {eod && <EodPanel eod={eod} memberName={member.name} />}
          </div>

          {commission ? (
            <CommissionPanel c={commission} />
          ) : (
            <Panel title="Commission owed">
              <p className="text-faint py-6 text-center text-sm">
                No payout line yet — commission rolls up here once this rep has deals
                with collected cash.
              </p>
            </Panel>
          )}
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <WorkPanel
          items={workItems}
          summary={workSummary}
          todayKey={todayKey}
          memberName={member.name}
        />
        {rep && (
          <Panel title="Recent activity" padded={recentActivity.length === 0}>
            {recentActivity.length === 0 ? (
              <p className="text-faint py-6 text-center text-sm">
                No logged calls or bookings yet.
              </p>
            ) : (
              <ActivityList rows={recentActivity} />
            )}
          </Panel>
        )}
      </div>

      {email && <EmailPanel email={email} />}
    </div>
  );
}
