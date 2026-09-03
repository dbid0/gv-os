import { mapFields, type FieldMap } from "@/lib/tracking/fields";
import { normalizeHeading, type TrackingTab } from "@/lib/tracking/tabs";

/**
 * One mirrored row from a client's tracking sheet.
 *
 * Every promoted field is nullable, because a half-filled row is the normal
 * case in a live sheet and a blank cell must stay blank. `payload` keeps the
 * whole row keyed by its own header text, so a column this app doesn't know
 * about yet is preserved rather than dropped.
 */
export interface TrackingRow {
  tab: TrackingTab;
  /** 1-based row number in the sheet, for tracing a figure back to its source. */
  rowIndex: number;
  occurredAt: Date | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  rep: string | null;
  status: string | null;
  outcome: string | null;
  /** Integer cents. Null when the column is absent OR the cell isn't a number. */
  cashCents: number | null;
  revenueCents: number | null;
  recordingUrl: string | null;
  notes: string | null;
  payload: Record<string, string>;
}

/** A sheet cell that carries no information. */
function blank(value: string | undefined): boolean {
  if (value === undefined) return true;
  const v = value.trim();
  // "#ERROR!" and "#N/A" are spreadsheet formula failures, not data. Reading
  // them as text would put "#ERROR!" in a phone number field.
  return v === "" || v.startsWith("#");
}

/**
 * The first candidate column that actually holds a value.
 *
 * Preference order decides MEANING ("Call Date" beats the form's "Timestamp");
 * this decides PRESENCE. A sheet where the preferred column is blank still
 * yields the fact from the fallback column instead of a null.
 */
function text(values: string[], columns: number[]): string | null {
  for (const idx of columns) {
    const v = values[idx];
    if (!blank(v)) return v.trim();
  }
  return null;
}

/**
 * Money as integer cents.
 *
 * Sheets hand back "7500", "$7,500.00", "943.4" and "" for the same column.
 * Anything that isn't cleanly a number returns null — a tracking figure that
 * cannot be read is unknown, never zero. Rounds to the nearest cent so 943.4
 * becomes 94340 rather than a float that drifts.
 */
export function parseMoneyCents(raw: string | null): number | null {
  if (raw === null) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const asNumber = Number(cleaned);
  if (!Number.isFinite(asNumber)) return null;
  return Math.round(asNumber * 100);
}

/**
 * A sheet date to a real Date.
 *
 * Tracking sheets mix "2026-08-03 16:53:39", "8/8/2026 9:52:48" and
 * "Jul 27 2026" in the same column across clients. Only these shapes are
 * accepted; anything else is null rather than a Date that silently lands in
 * 2001. Parsed as LOCAL time, matching how the sheet's own timestamps are
 * written by Google Forms in the sheet's timezone.
 */
export function parseSheetDate(raw: string | null): Date | null {
  if (raw === null) return null;
  const v = raw.trim();
  if (v === "") return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
    v,
  );
  if (iso) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = iso;
    return local(+y, +mo, +d, +h, +mi, +s);
  }

  const us =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (us) {
    const [, mo, d, y, h = "0", mi = "0", s = "0"] = us;
    return local(+y, +mo, +d, +h, +mi, +s);
  }

  const named = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(v);
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase());
    if (month === -1) return null;
    return local(+named[3], month + 1, +named[2], 0, 0, 0);
  }
  return null;
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function local(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const date = new Date(y, mo - 1, d, h, mi, s);
  // Reject a rolled-over date (Feb 31 becoming Mar 3).
  return date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/**
 * A recording link, or null when the cell holds something else.
 *
 * Closers type prose into this column — "na - cancelled 10 minutes before",
 * "n/a". Counting those as recordings overstated the transcript queue by
 * claiming 43 recordings on a tab where a third were sentences.
 */
export function parseRecordingUrl(raw: string | null): string | null {
  if (raw === null) return null;
  const v = raw.trim();
  return /^https?:\/\/\S+$/i.test(v) ? v : null;
}

/** An email, lowercased, or null when the cell isn't one. */
export function parseEmail(raw: string | null): string | null {
  if (raw === null) return null;
  const v = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/**
 * Parse one tab's values (header row first) into mirrored rows.
 *
 * A row with nothing in any promoted field AND an empty payload is dropped —
 * tracking sheets are 1000 rows of mostly-empty grid, and mirroring blank rows
 * would bury the real ones.
 */
export function parseTrackingTab(
  tab: TrackingTab,
  values: string[][],
): { rows: TrackingRow[]; fields: FieldMap; unmapped: string[] } {
  const [headerRow = [], ...body] = values;
  const fields = mapFields(headerRow);
  const claimed = new Set(Object.values(fields).flat());
  const unmapped = headerRow
    .map((h, i) => (claimed.has(i) || normalizeHeading(h) === "" ? null : h))
    .filter((h): h is string => h !== null);

  const rows: TrackingRow[] = [];
  body.forEach((raw, i) => {
    const payload: Record<string, string> = {};
    headerRow.forEach((header, col) => {
      const key = header.trim();
      if (key === "" || blank(raw[col])) return;
      payload[key] = raw[col].trim();
    });

    const row: TrackingRow = {
      tab,
      // +2: one for the header row, one because sheets are 1-based.
      rowIndex: i + 2,
      occurredAt: parseSheetDate(text(raw, fields.occurredAt)),
      email: parseEmail(text(raw, fields.email)),
      name: text(raw, fields.name),
      phone: text(raw, fields.phone),
      rep: text(raw, fields.rep),
      status: text(raw, fields.status),
      outcome: text(raw, fields.outcome),
      cashCents: parseMoneyCents(text(raw, fields.cash)),
      revenueCents: parseMoneyCents(text(raw, fields.revenue)),
      recordingUrl: parseRecordingUrl(text(raw, fields.recordingUrl)),
      notes: text(raw, fields.notes),
      payload,
    };
    if (Object.keys(payload).length === 0) return;
    rows.push(row);
  });

  return { rows, fields, unmapped };
}
