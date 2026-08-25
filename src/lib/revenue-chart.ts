/**
 * Pure geometry for the "Revenue over time" area chart — the RepVision-style
 * panel: a $ y-axis with nice round ticks, a dated x-axis, gridlines, and the
 * area/line paths. No DOM, no clock, so it is testable to the coordinate.
 *
 * The series is DAILY collected cash (not cumulative): the chart shows the
 * shape of the days money landed, the way RepVision's does.
 */

export interface ChartSeriesPoint {
  day: string; // yyyy-mm-dd
  cents: number;
}

export interface PlotPoint extends ChartSeriesPoint {
  x: number;
  y: number;
}

export interface AxisTick {
  /** SVG coordinate along the relevant axis. */
  pos: number;
  label: string;
}

export interface RevenueChartModel {
  width: number;
  height: number;
  baselineY: number;
  points: PlotPoint[];
  linePath: string;
  areaPath: string;
  yTicks: AxisTick[];
  xTicks: AxisTick[];
  niceMax: number;
}

export interface ChartOptions {
  width?: number;
  height?: number;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
  /** How many horizontal gridlines/labels (including zero). */
  yTickCount?: number;
  /** Approximate number of date labels on the x-axis. */
  xTickCount?: number;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-08-04" -> "Aug 4". Pure string parse — no Date, no timezone drift. */
export function shortDate(day: string): string {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return day;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${month} ${Number(m[3])}`;
}

/** Round a positive number up to a "nice" 1 / 2 / 2.5 / 5 × 10ⁿ ceiling. */
export function niceCeil(value: number): number {
  if (value <= 0) return 0;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const f = value / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

/** Whole-dollar compact label: $0, $500, $2.5k, $10k, $1.2M. */
export function compactUsd(cents: number): string {
  const d = Math.round(cents / 100);
  const abs = Math.abs(d);
  const sign = d < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trim(abs / 1_000)}k`;
  return `${sign}$${abs.toLocaleString("en-US")}`;
}

function trim(n: number): string {
  return Number(n.toFixed(1)).toString();
}

/** Evenly sample up to `count` indices from [0, n-1], always including the ends. */
function sampleIndices(n: number, count: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  const take = Math.max(2, Math.min(count, n));
  const out: number[] = [];
  for (let i = 0; i < take; i++) {
    out.push(Math.round((i / (take - 1)) * (n - 1)));
  }
  return [...new Set(out)];
}

export function buildRevenueChartModel(
  series: ChartSeriesPoint[],
  opts: ChartOptions = {},
): RevenueChartModel | null {
  if (series.length < 2) return null;

  const width = opts.width ?? 760;
  const height = opts.height ?? 260;
  const left = opts.marginLeft ?? 52;
  const right = opts.marginRight ?? 16;
  const top = opts.marginTop ?? 16;
  const bottom = opts.marginBottom ?? 28;
  const yTickCount = Math.max(2, opts.yTickCount ?? 5);
  const xTickCount = opts.xTickCount ?? 6;

  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const baselineY = top + plotH;

  const maxCents = Math.max(0, ...series.map((p) => p.cents));
  const niceMax = niceCeil(maxCents) || 1;

  const n = series.length;
  const x = (i: number) => left + (i / (n - 1)) * plotW;
  const y = (cents: number) => top + plotH * (1 - cents / niceMax);

  const points: PlotPoint[] = series.map((p, i) => ({
    ...p,
    x: x(i),
    y: y(p.cents),
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${round(p.x)},${round(p.y)}`)
    .join(" ");
  const areaPath =
    `M ${round(points[0].x)},${round(baselineY)} ` +
    points.map((p) => `L ${round(p.x)},${round(p.y)}`).join(" ") +
    ` L ${round(points[n - 1].x)},${round(baselineY)} Z`;

  const yTicks: AxisTick[] = [];
  for (let i = 0; i < yTickCount; i++) {
    const value = (niceMax * i) / (yTickCount - 1);
    yTicks.push({ pos: round(y(value)), label: compactUsd(value) });
  }

  const xTicks: AxisTick[] = sampleIndices(n, xTickCount).map((i) => ({
    pos: round(x(i)),
    label: shortDate(series[i].day),
  }));

  return {
    width,
    height,
    baselineY,
    points,
    linePath,
    areaPath,
    yTicks,
    xTicks,
    niceMax,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
