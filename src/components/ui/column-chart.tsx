"use client";

import { useState } from "react";

import type { DayBucket } from "@/lib/charts";
import { CHART_CATEGORICAL } from "@/lib/charts";
import { cn } from "@/lib/utils";

/**
 * A single-series column chart, built to the dataviz mark spec: thin marks
 * with 4px rounded data-ends anchored to the baseline, 2px gaps between
 * columns, a recessive grid, tabular numerals, and a per-mark hover tooltip.
 * One series → no legend (the panel title names it); series color from the
 * validated chart palette, never the roster accents.
 */

const H = 160;
const GRID_LINES = 3;

export function ColumnChart({
  data,
  color = CHART_CATEGORICAL[0],
  className,
}: {
  data: DayBucket[];
  color?: string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const peakIndex = data.findIndex((d) => d.value === max);

  return (
    <div className={cn("relative", className)}>
      {/* Recessive grid: three hairlines, labels in muted ink. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0"
        style={{ height: H }}
      >
        {Array.from({ length: GRID_LINES }).map((_, i) => (
          <div
            key={i}
            className="border-border/50 absolute inset-x-0 border-t"
            style={{ top: (H * (i + 1)) / (GRID_LINES + 1) }}
          />
        ))}
      </div>

      <div className="flex items-end gap-[2px]" style={{ height: H }}>
        {data.map((d, i) => {
          const barH = d.value === 0 ? 2 : Math.max(4, (d.value / max) * (H - 24));
          const active = hover === i;
          return (
            <button
              key={d.date}
              type="button"
              aria-label={`${d.label}: ${d.value}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="group relative flex min-w-0 flex-1 cursor-default flex-col items-center justify-end self-stretch"
            >
              {/* Selective direct label: the peak, plus whatever is hovered. */}
              {(active || (i === peakIndex && d.value > 0)) && (
                <span
                  className={cn(
                    "mb-1 text-[10px] font-medium tabular-nums",
                    active ? "text-foreground" : "text-faint",
                  )}
                >
                  {d.value}
                </span>
              )}
              <span
                aria-hidden
                className="w-full rounded-t-[4px] transition-opacity"
                style={{
                  height: barH,
                  background: color,
                  opacity: d.value === 0 ? 0.15 : active ? 1 : 0.82,
                }}
              />
              {active && (
                <span className="bg-popover text-popover-foreground pointer-events-none absolute -top-9 z-10 rounded-md border px-2 py-1 text-[11px] whitespace-nowrap shadow-sm">
                  {d.label} ·{" "}
                  <span className="font-medium tabular-nums">{d.value}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Axis: first, middle, last date only — recessive. */}
      <div className="text-faint mt-1.5 flex justify-between text-[10px]">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
