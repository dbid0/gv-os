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
