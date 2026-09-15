import { describe, expect, it } from "vitest";

import {
  ATTRIBUTION_METRICS,
  attribution,
  DEFAULT_METRIC,
  MAX_SLICES,
  NEUTRAL_MIX,
  OTHER,
  readMetric,
} from "@/lib/tracking/attribution-slices";
import { NO_APPLICATION, NO_TAG, type SourceRow } from "@/lib/tracking/source-funnel";

const src = (value: string, over: Partial<SourceRow> = {}): SourceRow => ({
  value,
  unattributed: false,
  clicks: null,
  applicants: 0,
  bookedPeople: 0,
  held: 0,
  shows: 0,
  noShows: 0,
  closes: 0,
  bookRate: null,
  showRate: null,
  closeRate: null,
  ...over,
});

/** Rows plus the total line they must reconcile to. */
const withTotal = (rows: SourceRow[]) => {
  const sum = (k: "applicants" | "bookedPeople" | "shows" | "closes") =>
    rows.reduce((n, r) => n + r[k], 0);
  return {
    rows,
    total: src("All sources", {
      applicants: sum("applicants"),
      bookedPeople: sum("bookedPeople"),
      shows: sum("shows"),
      closes: sum("closes"),
    }),
  };
};

describe("readMetric", () => {
  it("takes a known metric and falls back rather than throwing", () => {
    expect(readMetric("closes")).toBe("closes");
    expect(readMetric("cash")).toBe(DEFAULT_METRIC);
    expect(readMetric(undefined)).toBe(DEFAULT_METRIC);
    expect(readMetric(["closes"])).toBe(DEFAULT_METRIC);
  });
});

describe("attribution", () => {
  it("orders real sources biggest first and fills the whole ring", () => {
    const { rows, total } = withTotal([
      src("youtube", { applicants: 10 }),
      src("instagram", { applicants: 30 }),
      src("x", { applicants: 60 }),
    ]);
    const a = attribution(rows, total, "applicants");

    expect(a.slices.map((s) => s.value)).toEqual(["x", "instagram", "youtube"]);
    expect(a.slices.map((s) => Math.round(s.sharePct))).toEqual([60, 30, 10]);
    expect(a.total).toBe(100);
    expect(a.reconciles).toBe(true);

    // Arcs sit end to end and close the circle exactly.
    expect(a.slices[0].offset).toBe(0);
    a.slices.forEach((s, i) => {
      if (i > 0) {
        const prev = a.slices[i - 1];
        expect(s.offset).toBeCloseTo(prev.offset + prev.fraction, 10);
      }
    });
    const last = a.slices[a.slices.length - 1];
    expect(last.offset + last.fraction).toBeCloseTo(1, 10);
  });

  it("keeps the catch-all buckets but sorts them last however big they are", () => {
    const { rows, total } = withTotal([
      src(NO_TAG, { unattributed: true, applicants: 80 }),
      src("youtube", { applicants: 15 }),
      src(NO_APPLICATION, { unattributed: true, applicants: 5 }),
    ]);
    const a = attribution(rows, total, "applicants");

    // The biggest count is unattributed, and it still does not lead.
    expect(a.slices.map((s) => s.value)).toEqual(["youtube", NO_TAG, NO_APPLICATION]);
    // It is drawn, not hidden — hiding it would inflate youtube's share.
    expect(a.slices.find((s) => s.value === NO_TAG)?.count).toBe(80);
    expect(Math.round(a.slices[0].sharePct)).toBe(15);
  });

  it("gives a zero-count value no arc, because a zero is not a picture", () => {
    const { rows, total } = withTotal([
      src("youtube", { applicants: 4 }),
      src("dormant", { applicants: 0 }),
    ]);
    const a = attribution(rows, total, "applicants");
    expect(a.slices.map((s) => s.value)).toEqual(["youtube"]);
    expect(a.reconciles).toBe(true);
  });

  it("folds the tail into one named Other slice", () => {
    const rows = Array.from({ length: MAX_SLICES + 4 }, (_, i) =>
      src(`s${i}`, { applicants: 100 - i }),
    );
    const { total } = withTotal(rows);
    const a = attribution(rows, total, "applicants");

    expect(a.slices).toHaveLength(MAX_SLICES);
    const other = a.slices[a.slices.length - 1];
    expect(other.value).toBe(OTHER);
    // It says how many it holds, and holds exactly the tail's total.
    expect(other.folds).toBe(5);
    expect(other.count).toBe(
      rows.slice(MAX_SLICES - 1).reduce((n, r) => n + r.applicants, 0),
    );
    // The ring still closes.
    expect(a.slices.reduce((n, s) => n + s.fraction, 0)).toBeCloseTo(1, 10);
    expect(a.reconciles).toBe(true);
  });

  it("never folds a catch-all bucket into Other", () => {
    const rows = [
      ...Array.from({ length: MAX_SLICES + 2 }, (_, i) =>
        src(`s${i}`, { applicants: 100 - i }),
      ),
      src(NO_TAG, { unattributed: true, applicants: 1 }),
    ];
    const { total } = withTotal(rows);
    const a = attribution(rows, total, "applicants");

    // (no tag) counts least of all, and is still named rather than folded.
    expect(a.slices.map((s) => s.value)).toContain(NO_TAG);
    expect(a.slices[a.slices.length - 1].value).toBe(NO_TAG);
    expect(a.slices.find((s) => s.value === OTHER)?.folds).toBe(3);
  });

  it("adds no Other slice when the tail is only catch-all buckets", () => {
    const rows = [
      ...Array.from({ length: MAX_SLICES - 1 }, (_, i) =>
        src(`s${i}`, { applicants: 100 - i }),
      ),
      src(NO_TAG, { unattributed: true, applicants: 9 }),
      src(NO_APPLICATION, { unattributed: true, applicants: 4 }),
    ];
    const { total } = withTotal(rows);
    const a = attribution(rows, total, "applicants");

    // Seven values, but nothing real is left over to fold, so no "Other".
    expect(a.slices).toHaveLength(MAX_SLICES + 1);
    expect(a.slices.some((s) => s.value === OTHER)).toBe(false);
    expect(a.slices.slice(-2).map((s) => s.value)).toEqual([NO_TAG, NO_APPLICATION]);
    expect(a.reconciles).toBe(true);
  });

  it("separates the neutral buckets from each other, not just from the hues", () => {
    // These three sit together at the end of the ring. One shared grey would
    // draw them as a single arc.
    const rows = [
      ...Array.from({ length: MAX_SLICES }, (_, i) =>
        src(`s${i}`, { applicants: 100 - i }),
      ),
      src(NO_TAG, { unattributed: true, applicants: 9 }),
      src(NO_APPLICATION, { unattributed: true, applicants: 4 }),
    ];
    const { total } = withTotal(rows);
    const neutrals = attribution(rows, total, "applicants").slices.filter(
      (s) => s.hue === null,
    );

    expect(neutrals.map((s) => s.value)).toEqual([OTHER, NO_TAG, NO_APPLICATION]);
    expect(neutrals.map((s) => s.mix)).toEqual([...NEUTRAL_MIX]);
    expect(new Set(neutrals.map((s) => s.mix)).size).toBe(neutrals.length);
  });

  it("says so when the rows stop summing to the total line", () => {
    const rows = [src("youtube", { applicants: 3 })];
    const wrong = src("All sources", { applicants: 99 });
    expect(attribution(rows, wrong, "applicants").reconciles).toBe(false);
  });

  it("draws nothing at all when the metric counts nothing", () => {
    const { rows, total } = withTotal([src("youtube", { applicants: 0 })]);
    const a = attribution(rows, total, "applicants");
    expect(a.slices).toEqual([]);
    expect(a.total).toBe(0);
    expect(a.reconciles).toBe(true);
  });

  it("re-cuts the same rows for every offered metric", () => {
    const { rows, total } = withTotal([
      src("youtube", { applicants: 50, bookedPeople: 10, shows: 6, closes: 1 }),
      src("x", { applicants: 10, bookedPeople: 8, shows: 2, closes: 2 }),
    ]);
    for (const m of ATTRIBUTION_METRICS) {
      const a = attribution(rows, total, m.key);
      expect(a.label).toBe(m.label);
      expect(a.reconciles).toBe(true);
      expect(a.slices.reduce((n, s) => n + s.count, 0)).toBe(a.total);
    }
    // Closes tell a different story from applicants — the point of the picker.
    expect(attribution(rows, total, "applicants").slices[0].value).toBe("youtube");
    expect(attribution(rows, total, "closes").slices[0].value).toBe("x");
  });

  it("breaks ties by name so the ring is stable between loads", () => {
    const { rows, total } = withTotal([
      src("zeta", { applicants: 5 }),
      src("alpha", { applicants: 5 }),
    ]);
    expect(attribution(rows, total, "applicants").slices.map((s) => s.value)).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("walks the approved hues, then walks them again lighter", () => {
    const rows = Array.from({ length: MAX_SLICES }, (_, i) =>
      src(`s${i}`, { applicants: 10 - i }),
    );
    const { total } = withTotal(rows);
    const a = attribution(rows, total, "applicants");

    // Three hues at full strength, then the same three lighter: no two arcs
    // share both channels, so every slice is separable from every other.
    expect(a.slices.map((s) => s.hue)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(a.slices.map((s) => s.mix)).toEqual([100, 100, 100, 55, 55, 55]);
    expect(new Set(a.slices.map((s) => `${s.hue}/${s.mix}`)).size).toBe(MAX_SLICES);
  });

  it("gives catch-all buckets a neutral tone and does not spend a hue on them", () => {
    const { rows, total } = withTotal([
      src("youtube", { applicants: 5 }),
      src(NO_TAG, { unattributed: true, applicants: 3 }),
      src("instagram", { applicants: 4 }),
    ]);
    const a = attribution(rows, total, "applicants");

    const tag = a.slices.find((s) => s.value === NO_TAG)!;
    expect(tag.hue).toBeNull();
    expect(tag.mix).toBe(NEUTRAL_MIX[0]);
    // The two real sources still get the first two distinct hues — the
    // unattributed bucket does not consume one and push them together.
    expect(a.slices.filter((s) => s.hue !== null).map((s) => s.hue)).toEqual([0, 1]);
  });
});
