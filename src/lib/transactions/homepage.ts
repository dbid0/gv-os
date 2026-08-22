/**
 * Homepage money (v2 §4) — pure, 100% covered. The big number is all-in
 * GROSS COLLECTED for the month (cash basis); revenue rides alongside for
 * AR context. The mode narrows the layer: All (default) · Agency · Clients.
 */

export const HOME_MODES = ["all", "agency", "clients"] as const;
export type HomeMode = (typeof HOME_MODES)[number];

export function normalizeHomeMode(value: unknown): HomeMode {
  return (HOME_MODES as readonly unknown[]).includes(value)
    ? (value as HomeMode)
    : "all";
}

export interface HomeRow {
  direction: string;
  layer: string;
  occurredOn: string;
  revenueCents: number;
  cashCents: number;
}

/** Income rows for the month, narrowed by mode. */
export function homeMonthRows<T extends HomeRow>(
  rows: T[],
  mode: HomeMode,
  month: string,
): T[] {
  return rows.filter(
    (r) =>
      r.direction === "in" &&
      r.occurredOn.slice(0, 7) === month &&
      (mode === "all" ||
        (mode === "agency" ? r.layer === "agency" : r.layer === "client")),
  );
}

export function homeHeadline(
  rows: HomeRow[],
  mode: HomeMode,
  month: string,
): { collectedCents: number; revenueCents: number } {
  const mine = homeMonthRows(rows, mode, month);
  return {
    collectedCents: mine.reduce((s, r) => s + r.cashCents, 0),
    revenueCents: mine.reduce((s, r) => s + r.revenueCents, 0),
  };
}

/**
 * Date ranges (v2 §4): preset spans computed in CT, DST-proof via noon-UTC
 * day math. Lifetime is unbounded. The range rides in the URL (shareable);
 * the mode stays persisted.
 */

export const HOME_RANGES = ["7d", "30d", "month", "last-month", "ytd", "life"] as const;
export type HomeRange = (typeof HOME_RANGES)[number];

export function normalizeHomeRange(value: unknown): HomeRange {
  return (HOME_RANGES as readonly unknown[]).includes(value)
    ? (value as HomeRange)
    : "month";
}

function shiftDayKey(key: string, byDays: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12) + byDays * 86_400_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export interface RangeBounds {
  /** yyyy-mm-dd inclusive; null = unbounded. */
  from: string | null;
  to: string | null;
  label: string;
}

export function rangeBounds(range: HomeRange, todayKey: string): RangeBounds {
  const month = todayKey.slice(0, 7);
  switch (range) {
    case "7d":
      return { from: shiftDayKey(todayKey, -6), to: todayKey, label: "Last 7 days" };
    case "30d":
      return { from: shiftDayKey(todayKey, -29), to: todayKey, label: "Last 30 days" };
    case "last-month": {
      const firstOfThis = `${month}-01`;
      const lastOfPrev = shiftDayKey(firstOfThis, -1);
      return {
        from: `${lastOfPrev.slice(0, 7)}-01`,
        to: lastOfPrev,
        label: "Last month",
      };
    }
    case "ytd":
      return {
        from: `${todayKey.slice(0, 4)}-01-01`,
        to: todayKey,
        label: "Year to date",
      };
    case "life":
      return { from: null, to: null, label: "Lifetime" };
    default:
      return { from: `${month}-01`, to: todayKey, label: "This month" };
  }
}

/** Income rows inside the bounds, narrowed by mode. */
export function homeRangeRows<T extends HomeRow>(
  rows: T[],
  mode: HomeMode,
  bounds: RangeBounds,
): T[] {
  return rows.filter(
    (r) =>
      r.direction === "in" &&
      (bounds.from === null || r.occurredOn >= bounds.from) &&
      (bounds.to === null || r.occurredOn <= bounds.to) &&
      (mode === "all" ||
        (mode === "agency" ? r.layer === "agency" : r.layer === "client")),
  );
}

export function homeRangeHeadline(
  rows: HomeRow[],
  mode: HomeMode,
  bounds: RangeBounds,
): { collectedCents: number; revenueCents: number } {
  const mine = homeRangeRows(rows, mode, bounds);
  return {
    collectedCents: mine.reduce((s, r) => s + r.cashCents, 0),
    revenueCents: mine.reduce((s, r) => s + r.revenueCents, 0),
  };
}
