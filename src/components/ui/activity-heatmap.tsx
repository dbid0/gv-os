"use client";

import { useState } from "react";

import type { HeatCell, HeatmapModel } from "@/lib/activity-heatmap";
import { cents, formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The activity heatmap (RepVision "Time Period Trends"): a contribution-style
 * grid, columns = weeks, rows = day of week, cells shaded green by intensity
 * (darker = more). The model is pure/tested in lib/activity-heatmap; this file
 * lays it out and handles hover. Darker = higher, per the legend.
 */

const CELL = 12;
const GAP = 3;
const COL_W = CELL + GAP;
const DOW_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function cellBg(level: HeatCell["level"]): string {
  if (level === 0)
    return "color-mix(in oklab, var(--muted-foreground) 12%, transparent)";
  const pct = [0, 32, 52, 74, 100][level];
  return `color-mix(in oklab, var(--success) ${pct}%, transparent)`;
}

export function ActivityHeatmap({
  model,
  unit = "cents",
  className,
}: {
  model: HeatmapModel;
  unit?: "cents" | "count";
  className?: string;
}) {
  const [hover, setHover] = useState<HeatCell | null>(null);
  const fmt = (v: number) =>
    unit === "cents" ? formatUSD(cents(v)) : v.toLocaleString("en-US");

  const gridWidth = model.weeks * COL_W;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-x-auto">
        <div className="flex gap-2" style={{ minWidth: gridWidth + 32 }}>
          {/* Day-of-week labels down the left. */}
          <div
            className="text-faint flex flex-col justify-between pt-[18px] text-[9px]"
            style={{ height: 18 + 7 * COL_W - GAP }}
          >
            {DOW_LABELS.map((d, i) => (
              <span key={i} style={{ height: CELL, lineHeight: `${CELL}px` }}>
                {d}
              </span>
            ))}
          </div>

          <div>
            {/* Month labels along the top. */}
            <div className="relative mb-1 h-[14px]" style={{ width: gridWidth }}>
              {model.monthLabels.map((m) => (
                <span
                  key={`${m.col}-${m.label}`}
                  className="text-faint absolute top-0 text-[9px]"
                  style={{ left: m.col * COL_W }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            {/* The week columns. */}
            <div className="flex" style={{ gap: GAP }}>
              {model.columns.map((col, w) => (
                <div key={w} className="flex flex-col" style={{ gap: GAP }}>
                  {col.map((cell, row) =>
                    cell === null ? (
                      <div key={row} style={{ width: CELL, height: CELL }} />
                    ) : (
                      <div
                        key={row}
                        onMouseEnter={() => setHover(cell)}
                        onMouseLeave={() => setHover(null)}
                        className="rounded-[2px] transition-transform hover:scale-125"
                        style={{
                          width: CELL,
                          height: CELL,
                          background: cellBg(cell.level),
                        }}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend + live hover read-out. */}
      <div className="text-faint flex items-center justify-between text-[11px]">
        <span className="tabular-nums">
          {hover ? (
            <>
              <span className="text-foreground font-medium">{fmt(hover.value)}</span> ·{" "}
              {shortLabel(hover.day)}
            </>
          ) : (
            "Darker = higher activity"
          )}
        </span>
        <span className="flex items-center gap-1">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span
              key={l}
              className="rounded-[2px]"
              style={{
                width: 10,
                height: 10,
                background: cellBg(l as HeatCell["level"]),
              }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

function shortLabel(day: string): string {
  const m = day.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : day;
}
