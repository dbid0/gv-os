"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Eye, Link2, Mail, Unlink } from "lucide-react";

import { linkMemberToRep } from "@/app/(app)/team/actions";
import { ActivityHeatmap } from "@/components/gamification/activity-heatmap";
import { PbCountBadge, PersonalBests } from "@/components/gamification/personal-bests";
import { StreakBadge } from "@/components/gamification/streak-badge";
import { Button } from "@/components/ui/button";
import { Kpi, Money } from "@/components/ui/metric";
import { Panel, Row, Rows } from "@/components/ui/panel";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { cents } from "@/lib/money";
import { type PaceStatus } from "@/lib/sales/quota-pacing";
import type {
  LinkableRep,
  MemberActivityRow,
  MemberCommission,
  MemberProfile,
} from "@/lib/team";
import type { QuotaRow } from "@/lib/sales/quota-queries";
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
          <span className="text-faint ml-auto text-xs">
            {new Date(r.occurredAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
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

/**
 * A member's profile: their identity, the sales rep they map to, and — once
 * linked — their quotas, momentum, commission owed, and recent activity pulled
 * from the read layers that already power Sales. An unlinked member gets the
 * identity card and a link control, an honest empty state rather than fake data.
 */
export function MemberBoard({
  profile,
  members,
  linkableReps,
}: {
  profile: MemberProfile;
  members: MemberOption[];
  linkableReps: LinkableRep[];
}) {
  const router = useRouter();
  const { member, rep, momentum, quotas, commission, recentActivity } = profile;
  const active = member.status === "active";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeaderRow
        member={member}
        rep={rep}
        active={active}
        members={members}
        streak={momentum?.streak.current ?? 0}
        pbCount={momentum?.personalBests.length ?? 0}
        hasMomentum={Boolean(momentum?.hasActivity)}
        onJump={(id) => router.push(`/team/${id}`)}
      />

      <Panel title="Details">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-faint text-xs">Role</dt>
            <dd className="text-sm">{memberRoleLabel(member)}</dd>
          </div>
          <div>
            <dt className="text-faint text-xs">Lane</dt>
            <dd className="text-sm">{member.clientName ?? "Agency-wide"}</dd>
          </div>
          <div>
            <dt className="text-faint text-xs">Email</dt>
            <dd className="text-sm">
              {member.email ? (
                <a
                  href={`mailto:${member.email}`}
                  className="hover:text-brand inline-flex items-center gap-1.5 transition-colors"
                >
                  <Mail className="size-3.5" /> {member.email}
                </a>
              ) : (
                <span className="text-faint">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-faint text-xs">Status</dt>
            <dd className="text-sm">{active ? "Active" : "Inactive"}</dd>
          </div>
          {member.notes && (
            <div className="sm:col-span-2">
              <dt className="text-faint text-xs">Notes</dt>
              <dd className="text-sm">{member.notes}</dd>
            </div>
          )}
        </dl>
      </Panel>

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
            commission below resolve to this rep.
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

          <Panel
            title="Quotas"
            aside={<span className="text-faint text-xs">{quotas.length} assigned</span>}
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

          <Panel title="Recent activity" padded={recentActivity.length === 0}>
            {recentActivity.length === 0 ? (
              <p className="text-faint py-6 text-center text-sm">
                No logged calls or bookings yet.
              </p>
            ) : (
              <ActivityList rows={recentActivity} />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/** The profile's header: identity, badges, back link, and the jump-to picker. */
function PageHeaderRow({
  member,
  rep,
  active,
  members,
  streak,
  pbCount,
  hasMomentum,
  onJump,
}: {
  member: MemberProfile["member"];
  rep: MemberProfile["rep"];
  active: boolean;
  members: MemberOption[];
  streak: number;
  pbCount: number;
  hasMomentum: boolean;
  onJump: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={active ? "live" : "muted"}>
            {active ? "Active" : "Inactive"}
          </StatusPill>
          {rep && hasMomentum && (
            <>
              <StreakBadge days={streak} />
              <PbCountBadge count={pbCount} />
            </>
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {member.name.split(" ")[0]}
          <span className="text-gradient-brand">&apos;s profile.</span>
        </h1>
        <p className="text-muted-foreground text-sm">
          {memberRoleLabel(member)} · {member.clientName ?? "Agency-wide"} lane.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
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
            onChange={(e) => onJump(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {roleLabel(m.role)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
