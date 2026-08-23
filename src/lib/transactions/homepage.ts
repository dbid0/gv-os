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

export const HOME_RANGES = [
  "today",
  "yesterday",
  "7d",
  "4w",
  "90d",
  "12m",
  "life",
  "month",
  "qtd",
  "ytd",
  // RepVision-parity presets.
  "this-week",
  "last-quarter",
  "last-year",
  // Legacy keys kept valid for saved URLs.
  "30d",
  "last-month",
] as const;
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

/** Day of week for a day key, 0 = Sunday (matches the calendar grid). */
function weekdayOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/** First day (yyyy-mm-01) of the quarter containing the given day key. */
function quarterStart(key: string): string {
  const month = Number(key.slice(5, 7));
  const startMonth = String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0");
  return `${key.slice(0, 4)}-${startMonth}-01`;
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
    case "today":
      return { from: todayKey, to: todayKey, label: "Today" };
    case "yesterday": {
      const y = shiftDayKey(todayKey, -1);
      return { from: y, to: y, label: "Yesterday" };
    }
    case "7d":
      return { from: shiftDayKey(todayKey, -6), to: todayKey, label: "Last 7 days" };
    case "4w":
      return { from: shiftDayKey(todayKey, -27), to: todayKey, label: "Last 4 weeks" };
    case "12m":
      return {
        from: shiftDayKey(todayKey, -364),
        to: todayKey,
        label: "Last 12 months",
      };
    case "qtd": {
      const month = Number(todayKey.slice(5, 7));
      const qStartMonth = String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0");
      return {
        from: `${todayKey.slice(0, 4)}-${qStartMonth}-01`,
        to: todayKey,
        label: "Quarter to date",
      };
    }
    case "this-week":
      return {
        from: shiftDayKey(todayKey, -weekdayOf(todayKey)),
        to: todayKey,
        label: "This week",
      };
    case "last-quarter": {
      const lastQEnd = shiftDayKey(quarterStart(todayKey), -1);
      return {
        from: quarterStart(lastQEnd),
        to: lastQEnd,
        label: "Last quarter",
      };
    }
    case "last-year": {
      const y = Number(todayKey.slice(0, 4)) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: "Last year" };
    }
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
    case "90d":
      return { from: shiftDayKey(todayKey, -89), to: todayKey, label: "Last 3 months" };
    case "ytd":
      return {
        from: `${todayKey.slice(0, 4)}-01-01`,
        to: todayKey,
        label: "Year to date",
      };
    case "life":
      return { from: null, to: null, label: "All time" };
    default:
      return { from: `${month}-01`, to: todayKey, label: "Month to date" };
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

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A dragged custom range from the calendar — validated, ordered, labeled. */
export function customBounds(from: unknown, to: unknown): RangeBounds | null {
  if (typeof from !== "string" || typeof to !== "string") return null;
  if (!DAY_KEY.test(from) || !DAY_KEY.test(to)) return null;
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return { from: lo, to: hi, label: "Custom range" };
}
