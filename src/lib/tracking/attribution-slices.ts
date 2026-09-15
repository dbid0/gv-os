/**
 * THE ATTRIBUTION DONUT — the source funnel as a part-to-whole picture.
 *
 * The donut answers one question the table makes you assemble by eye: of all
 * the people who did X, what share came from where? It is the SAME rows the
 * table draws, so the picture and the table can never tell different stories —
 * `reconciles` is false if the slices ever stop summing to the total line, and
 * the page refuses to draw a chart that disagrees with its own table.
 *
 * Honesty rules baked in here, not in the component:
 * - Only metrics every row can answer become slices. Clicks are NOT offered:
 *   they are null for the untagged buckets and for values with no registry
 *   link, so a "share of clicks" ring would silently be a share of some clicks.
 * - The two catch-all buckets ("(no tag)", "(no application)") are drawn, never
 *   hidden — dropping them would inflate every real source's share — but they
 *   sort last and take a neutral tone, because they are the absence of a
 *   source, not a source that beat the others.
 * - A value counting 0 gets no slice: a zero-width arc is not a picture of
 *   anything. It stays in the table, which is where zeroes belong.
 * - Beyond a readable number of arcs the tail folds into one "Other" slice that
 *   says how many values it holds.
 *
 * Colour reuses the APPROVED palette instead of inventing one. That palette has
 * three CVD-checked hues and a donut may need more arcs than that, so the arcs
 * walk the three hues in order and then walk them again lighter: hue first,
 * lightness second. Both channels survive the colour-blindness checks the
 * palette exists to pass, which eight invented hues would not. The legend also
 * names every arc with its count and share, so colour never carries meaning on
 * its own.
 *
 * Pure: no database, no clock, no colour strings (the component maps hue+mix).
 */

import type { SourceRow } from "@/lib/tracking/source-funnel";

export const ATTRIBUTION_METRICS = [
  { key: "applicants", label: "Applicants", noun: "applicants" },
  { key: "bookedPeople", label: "Booked", noun: "people booked" },
  { key: "shows", label: "Shows", noun: "shows" },
  { key: "closes", label: "Closes", noun: "closes" },
] as const;

export type AttributionMetric = (typeof ATTRIBUTION_METRICS)[number]["key"];

export const DEFAULT_METRIC: AttributionMetric = "applicants";

/** How many real arcs before the tail folds into "Other". */
export const MAX_SLICES = 6;

/** Hues in the approved categorical palette (see CHART_CATEGORICAL). */
export const PALETTE_SIZE = 3;

/**
 * Neutral steps for the catch-all buckets, strongest first. There can be three
 * ("(no tag)", "(no application)", "Other") and they sit next to each other at
 * the end of the ring, so they need their own separation — two adjacent arcs
 * of the same grey read as one arc.
 */
export const NEUTRAL_MIX = [55, 33, 20] as const;

export const OTHER = "Other";

export type AttributionSlice = {
  value: string;
  /** A catch-all bucket, or the folded tail: not a source anyone can spend on. */
  unattributed: boolean;
  count: number;
  /** count ÷ total as 0–1, for the arc's length. */
  fraction: number;
  /** Where the arc starts, 0–1 clockwise from 12 o'clock. */
  offset: number;
  /** count ÷ total, 0–100. */
  sharePct: number;
  /** Index into the approved categorical palette; null for a neutral bucket. */
  hue: number | null;
  /** How much of that hue the arc carries: 100 first time round, less after. */
  mix: number;
  /** For the folded slice: how many values it holds. Null otherwise. */
  folds: number | null;
};

export type Attribution = {
  metric: AttributionMetric;
  label: string;
  noun: string;
  total: number;
  slices: AttributionSlice[];
  /** False when the slices stop summing to the table's total row. */
  reconciles: boolean;
};

const metricOf = (r: SourceRow, metric: AttributionMetric): number => r[metric];

type Counted = {
  value: string;
  unattributed: boolean;
  count: number;
  folds: number | null;
};

/** `?metric=` from the URL, falling back to the default rather than throwing. */
export function readMetric(raw: unknown): AttributionMetric {
  return ATTRIBUTION_METRICS.some((m) => m.key === raw)
    ? (raw as AttributionMetric)
    : DEFAULT_METRIC;
}

export function attribution(
  rows: SourceRow[],
  total: SourceRow,
  metric: AttributionMetric,
): Attribution {
  const spec = ATTRIBUTION_METRICS.find((m) => m.key === metric)!;
  const totalCount = metricOf(total, metric);

  // Real sources first, biggest share leading; the catch-all buckets sort to
  // the back whatever they count, because they are not places to spend more.
  const counted: Counted[] = rows
    .map((r) => ({
      value: r.value,
      unattributed: r.unattributed,
      count: metricOf(r, metric),
      folds: null,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => {
      if (a.unattributed !== b.unattributed) return a.unattributed ? 1 : -1;
      return b.count - a.count || a.value.localeCompare(b.value);
    });

  const sum = counted.reduce((n, r) => n + r.count, 0);

  // Fold the tail, but never fold a catch-all bucket into "Other": being
  // nameable is that bucket's whole job.
  let shown = counted;
  if (counted.length > MAX_SLICES) {
    const head = counted.slice(0, MAX_SLICES - 1);
    const tail = counted.slice(MAX_SLICES - 1);
    const keep = tail.filter((r) => r.unattributed);
    const fold = tail.filter((r) => !r.unattributed);
    const other: Counted[] =
      fold.length === 0
        ? []
        : [
            {
              value: OTHER,
              unattributed: true,
              count: fold.reduce((n, r) => n + r.count, 0),
              folds: fold.length,
            },
          ];
    shown = [...head, ...other, ...keep];
  }

  let offset = 0;
  let real = 0;
  let neutral = 0;
  const slices: AttributionSlice[] = shown.map((r) => {
    // Safe: every counted row survived `count > 0`, so an empty `shown` is the
    // only way sum could be 0, and then there is nothing to divide.
    const fraction = r.count / sum;
    const slice: AttributionSlice = {
      value: r.value,
      unattributed: r.unattributed,
      count: r.count,
      fraction,
      offset,
      sharePct: fraction * 100,
      // Walk the approved hues in order; once they run out, walk them again
      // lighter. Two channels (hue, then lightness) separate more arcs than
      // either alone, and both survive the colour-blindness checks the palette
      // was validated against.
      hue: r.unattributed ? null : real % PALETTE_SIZE,
      mix: r.unattributed
        ? // Clamped, not guarded: three neutral buckets is the ceiling today,
          // and a fourth should reuse the faintest step, not crash the ring.
          NEUTRAL_MIX[Math.min(neutral, NEUTRAL_MIX.length - 1)]
        : real < PALETTE_SIZE
          ? 100
          : 55,
      folds: r.folds,
    };
    if (r.unattributed) neutral++;
    else real++;
    offset += fraction;
    return slice;
  });

  return {
    metric,
    label: spec.label,
    noun: spec.noun,
    total: totalCount,
    slices,
    reconciles: sum === totalCount,
  };
}
