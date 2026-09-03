import type { FieldMap } from "@/lib/tracking/fields";
import type { TrackingRow } from "@/lib/tracking/parse";
import type { TrackingTab } from "@/lib/tracking/tabs";

/**
 * What one tab looked like on a pull — the deep-scan signal.
 *
 * A sync that only reported "imported 354 rows" would hide the thing worth
 * knowing. The Grid's Calls Log holds 109 rows of which 7 carry any date, so
 * every per-day call metric built on that tab is reading 6% of the tab. That
 * is a fact about the CLIENT'S SHEET, not a bug to paper over, and it belongs
 * on screen.
 */
export interface TabScan {
  tab: TrackingTab;
  rows: number;
  /** Rows with a usable date — the denominator any per-day metric really has. */
  dated: number;
  /** Rows with a real email — what the lead timeline can stitch on. */
  identified: number;
  /** EOC rows carrying a call recording link. */
  withRecording: number;
  /** Headers this app does not model; their values are kept in the payload. */
  unmappedColumns: string[];
  /** Canonical fields this tab has no column for at all. */
  missingFields: string[];
}

export function scanTab(
  tab: TrackingTab,
  rows: TrackingRow[],
  fields: FieldMap,
  unmapped: string[],
): TabScan {
  return {
    tab,
    rows: rows.length,
    dated: rows.filter((r) => r.occurredAt !== null).length,
    identified: rows.filter((r) => r.email !== null).length,
    withRecording: rows.filter((r) => r.recordingUrl !== null).length,
    unmappedColumns: unmapped,
    missingFields: Object.entries(fields)
      .filter(([, columns]) => columns.length === 0)
      .map(([field]) => field),
  };
}

/** Plain-language warnings a person should act on, worst first. */
export function scanWarnings(scans: TabScan[]): string[] {
  const out: string[] = [];
  for (const s of scans) {
    if (s.rows === 0) continue;
    const undated = s.rows - s.dated;
    if (undated > 0) {
      const pct = Math.round((undated / s.rows) * 100);
      // Below a tenth is noise in a hand-kept sheet; a fifth is a broken column.
      if (pct >= 20) {
        out.push(
          `${s.tab}: ${undated} of ${s.rows} rows have no date (${pct}%) — per-day figures for this tab are incomplete.`,
        );
      }
    }
  }
  return out.sort((a, b) => b.localeCompare(a));
}
