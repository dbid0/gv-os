import { type Heatmap, WEEKDAY_LABELS, formatDayKey } from "@/lib/gamification/engine";
import { cn } from "@/lib/utils";

/**
 * The activity heatmap — a GitHub-style grid, one column per week (oldest left)
 * and seven rows Sunday → Saturday, darker where the day was busier. Intensity
 * steps in the single brand hue by brightness, the way the charts do, so the
 * grid reads as part of the same system. The "best day" callout mirrors
 * RepVision's "Best: Wednesday".
 *
 * A server component: the hover detail is a native title, so there is no client
 * JavaScript to ship. An empty window says so plainly rather than pretending.
 */

/** Level 0 (empty) → 4 (busiest), stepping the brand by brightness. */
const LEVEL_CLASS = [
  "bg-secondary",
  "bg-brand/25",
  "bg-brand/45",
  "bg-brand/70",
  "bg-brand",
] as const;

export function ActivityHeatmap({ heatmap }: { heatmap: Heatmap }) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="flex gap-1">
          {/* Weekday labels, aligned to the rows. Mon/Wed/Fri only, to breathe. */}
          <div className="mr-1 flex flex-col gap-1">
            {WEEKDAY_LABELS.map((label, i) => (
              <span key={label} className="text-faint h-3 text-[9px] leading-3">
                {i % 2 === 1 ? label : ""}
              </span>
            ))}
          </div>
          {heatmap.weeks.map((week) => (
            <div key={week[0].dayKey} className="flex flex-col gap-1">
              {week.map((cell) => (
                <span
                  key={cell.dayKey}
                  title={`${formatDayKey(cell.dayKey)}: ${cell.value} ${
                    cell.value === 1 ? "action" : "actions"
                  }`}
                  className={cn("size-3 rounded-[3px]", LEVEL_CLASS[cell.level])}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {heatmap.bestWeekdayLabel ? (
          <p className="text-muted-foreground text-xs">
            Best day:{" "}
            <span className="text-foreground font-medium">
              {heatmap.bestWeekdayLabel}
            </span>
          </p>
        ) : (
          <p className="text-faint text-xs">No activity in this window yet.</p>
        )}
        <div className="flex items-center gap-1">
          <span className="text-faint text-[10px]">Less</span>
          {LEVEL_CLASS.map((c) => (
            <span key={c} className={cn("size-3 rounded-[3px]", c)} />
          ))}
          <span className="text-faint text-[10px]">More</span>
        </div>
      </div>
    </div>
  );
}
