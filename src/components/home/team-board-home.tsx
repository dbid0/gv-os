import Link from "next/link";

import { PbCountBadge } from "@/components/gamification/personal-bests";
import { StreakBadge } from "@/components/gamification/streak-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { type RepMomentum } from "@/lib/gamification/queries";
import { roleLabel } from "@/lib/team-roles";

/**
 * The team board home — the doorway shown to a member who is not (yet) a linked
 * sales rep: the roster, and every rep's live streak / personal-best momentum.
 * A rep sees their own Wingman board instead; this keeps the board useful for
 * team leads and admins without pretending a non-rep has quota numbers.
 */

export interface TeamBoardMember {
  id: string;
  name: string;
  role: string;
}

export function TeamBoardHome({
  members,
  momentum,
  notARep,
}: {
  members: TeamBoardMember[];
  momentum: RepMomentum[];
  /** True when the signed-in person has no rep link — sets an honest header note. */
  notARep: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Your"
        highlight="board."
        description={
          notARep
            ? "The floor at a glance: the roster and every rep's momentum. Your own quota board appears here once your account is linked to a sales rep."
            : "The floor at a glance: the roster and every rep's momentum. Accounting lives with the admins."
        }
      />

      {members.length === 0 ? (
        <Panel title="No roster yet">
          <p className="text-faint py-8 text-center text-sm">
            The roster lives under Team — once members are added, each gets a profile
            here.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {members.map((m) => (
            <Link
              key={m.id}
              href={`/team/${m.id}`}
              className="card-grad hover-lift hover:border-brand/40 rounded-lg border p-4"
            >
              <p className="text-sm font-medium">{m.name}</p>
              <p className="text-muted-foreground text-xs">{roleLabel(m.role)}</p>
            </Link>
          ))}
        </div>
      )}

      <Panel
        title="Rep momentum"
        aside={<span className="text-faint text-xs">Streaks &amp; personal bests</span>}
        padded={false}
      >
        {momentum.length === 0 ? (
          <p className="text-faint p-8 text-center text-sm">
            No reps yet — streaks and personal bests appear here as reps log calls, file
            EODs, and close deals.
          </p>
        ) : (
          <div className="bg-border flex flex-col gap-px">
            {momentum.map((m) => (
              <Link
                key={m.repId}
                href={`/home/member/${m.repId}`}
                className="bg-card hover:bg-secondary flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors"
              >
                <div className="mr-auto min-w-0">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {roleLabel(m.role)}
                    {m.teamName ? ` · ${m.teamName}` : ""}
                  </p>
                </div>
                <StreakBadge days={m.currentStreak} />
                <PbCountBadge count={m.personalBestCount} />
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Your EODs">
        <p className="text-faint text-sm">
          Daily reports run through the{" "}
          <Link href="/sales/eod/submit" className="text-brand">
            EOD form
          </Link>{" "}
          for sales roles; team EODs stay on the Agency EODs flow until they move
          in-app.
        </p>
      </Panel>
    </div>
  );
}
