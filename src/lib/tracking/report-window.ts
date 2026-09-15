/**
 * REPORT WINDOWS — the date range a re-cut table (Sources, calls by closer)
 * reads, as chips in its own URL param.
 *
 * These tables default to ALL TIME, which is what they showed before a range
 * existed: opening the page never changes a number; picking a window does.
 * Windows reuse the dashboards' Central-time day bounds (rangeBounds), so
 * "This month" means the same days everywhere.
 *
 * Pure: today's key is passed in.
 */

import { dayKeyCT } from "@/lib/charts";
import { rangeBounds, type RangeBounds } from "@/lib/transactions/homepage";

export const REPORT_RANGES = [
  { key: "life", label: "All time" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "qtd", label: "This quarter" },
] as const;

export type ReportRange = (typeof REPORT_RANGES)[number]["key"];

export function readReportRange(raw: unknown): ReportRange {
  return REPORT_RANGES.some((r) => r.key === raw) ? (raw as ReportRange) : "life";
}

export function reportBounds(range: ReportRange, todayKey: string): RangeBounds {
  return rangeBounds(range, todayKey);
}

export const isBounded = (b: RangeBounds): boolean => b.from !== null || b.to !== null;

/**
 * Whether a moment falls inside the window (Central-time days, inclusive).
 * All time takes everything, undated included; a real window can't place an
 * undated row, so it leaves it out rather than guessing.
 */
export function inWindow(at: Date | null, b: RangeBounds): boolean {
  if (!isBounded(b)) return true;
  if (!at) return false;
  const key = dayKeyCT(at);
  return (b.from === null || key >= b.from) && (b.to === null || key <= b.to);
}
