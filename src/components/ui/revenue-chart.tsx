"use client";

import { useState } from "react";

import { buildRevenueChartModel, type ChartSeriesPoint } from "@/lib/revenue-chart";
import { formatUSD, cents } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The "Revenue over time" area chart (RepVision-style): a real $ y-axis with
 * nice round gridlines, a dated x-axis, a soft brand-gradient fill under a lit
 * line, and a crosshair + tooltip on hover. Geometry comes from the pure,
 * tested model in lib/revenue-chart; this file only draws it and handles hover.
 *
 * One series → no legend (the panel title names it). The viewBox scales
 * uniformly (meet, not none) so axis text never distorts.
 */
export function RevenueChart({
  series,
  className,
}: {
  series: ChartSeriesPoint[];
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const model = buildRevenueChartModel(series, { width: 760, height: 260 });

  if (!model) {
    return (
      <p className="text-faint py-12 text-center text-sm">
        Not enough days to chart yet — revenue plots as cash lands.
      </p>
    );
  }

  const { width, height, baselineY, points, linePath, areaPath, yTicks, xTicks } =
    model;
  const active = hover !== null ? points[hover] : null;

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Revenue collected per day over the selected range"
      >
        <defs>
          <linearGradient id="gv-revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive gridlines + $ axis labels. */}
        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line
              x1={points[0].x}
              x2={points[points.length - 1].x}
              y1={t.pos}
              y2={t.pos}
              stroke="var(--border)"
              strokeWidth="1"
              opacity="0.5"
            />
            <text
              x={points[0].x - 8}
              y={t.pos}
              textAnchor="end"
              dominantBaseline="middle"
              className="text-faint text-[10px] tabular-nums"
              fill="currentColor"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Dated x-axis labels. */}
        {xTicks.map((t, i) => (
          <text
            key={`x-${i}`}
            x={t.pos}
            y={baselineY + 18}
            textAnchor="middle"
            className="text-faint text-[10px] tabular-nums"
            fill="currentColor"
          >
            {t.label}
          </text>
        ))}

        <path d={areaPath} fill="url(#gv-revenue-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover crosshair + point. */}
        {active && (
          <g pointerEvents="none">
            <line
              x1={active.x}
              x2={active.x}
              y1={points.reduce((m, p) => Math.min(m, p.y), Infinity)}
              y2={baselineY}
              stroke="var(--brand)"
              strokeWidth="1"
              opacity="0.4"
            />
            <circle cx={active.x} cy={active.y} r="3.5" fill="var(--brand)" />
          </g>
        )}

        {/* Invisible hit columns — bigger than the marks, for easy hover. */}
        {points.map((p, i) => {
          const half =
            points.length > 1
              ? (points[points.length - 1].x - points[0].x) / (points.length - 1) / 2
              : 10;
          return (
            <rect
              key={`hit-${i}`}
              x={p.x - half}
              y={0}
              width={half * 2}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>

      {active && (
        <div className="text-muted-foreground pointer-events-none mt-1 text-center text-xs">
          <span className="text-foreground font-medium tabular-nums">
            {formatUSD(cents(active.cents))}
          </span>{" "}
          collected {shortDayLabel(active.day)}
        </div>
      )}
    </div>
  );
}

function shortDayLabel(day: string): string {
  const m = day.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : day;
}
