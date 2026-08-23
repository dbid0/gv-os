import { ActivityHeatmap } from "@/components/gamification/activity-heatmap";
import { PbCountBadge, PersonalBests } from "@/components/gamification/personal-bests";
import { StreakBadge } from "@/components/gamification/streak-badge";
import { Panel } from "@/components/ui/panel";
import { type RepGamificationView } from "@/lib/gamification/queries";
import { roleLabel } from "@/lib/team-roles";

/**
 * A rep's full momentum: streak, personal bests, and the activity heatmap.
 * Every figure is derived from real rows by the fully covered engine, so a rep
 * who has never logged anything sees an honest empty state instead of a wall of
 * zeros.
 */
export function RepMomentumDetail({ view }: { view: RepGamificationView }) {
  const { rep, gamification } = view;
  const { streak, personalBests, heatmap, hasActivity } = gamification;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold tracking-tight">{rep.name}</h1>
          <p className="text-muted-foreground text-sm">
            {roleLabel(rep.role)}
            {rep.teamName ? ` · ${rep.teamName}` : ""}
          </p>
        </div>
        <StreakBadge days={streak.current} />
        <PbCountBadge count={personalBests.length} />
      </div>

      {!hasActivity ? (
        <Panel title="No momentum yet">
          <p className="text-faint py-8 text-center text-sm">
            Once {rep.name} logs a call, files an EOD, or closes a deal, their streak,
            personal bests, and activity heatmap build up here.
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Current streak" value={streak.current} suffix="days" />
            <StatTile label="Longest streak" value={streak.longest} suffix="days" />
            <StatTile
              label="Personal bests"
              value={personalBests.length}
              suffix="set"
            />
          </div>

          <Panel title="Activity heatmap">
            <ActivityHeatmap heatmap={heatmap} />
          </Panel>

          <Panel title="Personal bests">
            <PersonalBests bests={personalBests} />
          </Panel>
        </>
      )}
    </div>
  );
}

/** A small figure tile, in the metric-tile idiom. */
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
