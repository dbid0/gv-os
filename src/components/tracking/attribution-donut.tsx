import { CHART_CATEGORICAL } from "@/lib/charts";
import type { Attribution, AttributionSlice } from "@/lib/tracking/attribution-slices";

/**
 * The attribution donut — where an offer's people came from, as a ring.
 *
 * Server-rendered SVG, the same shape as the rest of the charts here. One arc
 * per source, ordered biggest first, in a lightness ramp of a single hue (see
 * attribution-slices.ts for why that instead of categorical colours). Every arc
 * is also named in the legend with its count and share, so the ring is the
 * quick read and the legend is the precise one — colour never carries meaning
 * alone.
 *
 * The centre holds the total, which is the table's total row. If the arcs ever
 * stopped summing to it the page would not render this at all.
 */

const SIZE = 168;
const R = 66;
const STROKE = 26;
const C = 2 * Math.PI * R;

const toneOf = (s: AttributionSlice) =>
  s.hue === null
    ? `color-mix(in oklab, var(--muted-foreground) ${s.mix}%, transparent)`
    : `color-mix(in oklab, ${CHART_CATEGORICAL[s.hue]} ${s.mix}%, var(--card))`;

export function AttributionDonut({ data, by }: { data: Attribution; by: string }) {
  const { slices, total, label, noun } = data;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-[168px] w-[168px] shrink-0"
        role="img"
        aria-label={`${label} by ${by}: ${slices
          .map((s) => `${s.value} ${Math.round(s.sharePct)}%`)
          .join(", ")}`}
      >
        {/* The ring's own track, so a part-drawn donut still reads as a whole. */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--border)"
          strokeWidth={STROKE}
          opacity={0.35}
        />
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {slices.map((s) => (
            <circle
              key={s.value}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={toneOf(s)}
              strokeWidth={STROKE}
              strokeDasharray={`${s.fraction * C} ${C}`}
              strokeDashoffset={-s.offset * C}
            />
          ))}
        </g>
        <text
          x={SIZE / 2}
          y={SIZE / 2 - 2}
          textAnchor="middle"
          fill="var(--foreground)"
          fontSize="26"
          fontWeight="600"
          className="tabular-nums"
        >
          {total.toLocaleString("en-US")}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 16}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="10"
        >
          {noun}
        </text>
      </svg>

      <ul className="min-w-[14rem] flex-1 space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.value} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px] border"
              style={{ background: toneOf(s) }}
            />
            <span
              className={
                s.unattributed ? "text-muted-foreground truncate italic" : "truncate"
              }
            >
              {s.value}
              {s.folds !== null && (
                <span className="text-faint"> · {s.folds} more</span>
              )}
            </span>
            <span className="text-faint ml-auto shrink-0 tabular-nums">
              {s.count.toLocaleString("en-US")}
            </span>
            <span className="w-11 shrink-0 text-right tabular-nums">
              {Math.round(s.sharePct)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
