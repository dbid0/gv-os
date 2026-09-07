/**
 * WHERE A TASK LANDS ON THE CALENDAR.
 *
 * Two ways a task gets a place on the grid, and they never mix:
 *
 *   • An explicit due date wins outright — that day, exactly once, whatever
 *     the cadence says. Scheduling by hand is a decision; the cadence is only
 *     a default rhythm.
 *   • No due date → the cadence places it: daily paints every day, weekly
 *     lands on Mondays, monthly on the 1st. That is "the calendar synced with
 *     the work" — standing work pops up on its rhythm without anyone
 *     scheduling it.
 *
 * A completed task keeps its dated slot (finished work is history) but a
 * completed RECURRING task disappears — done standing work must not keep
 * painting the future.
 *
 * All day math is done at UTC noon so a YYYY-MM-DD key can never slip a day
 * across timezones or DST.
 */

export interface CadencedItem {
  status: string;
  cadence: string;
  dueDate: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toNoon(key: string): number {
  return Date.parse(`${key}T12:00:00Z`);
}

function toKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Day keys in [fromKey, toKey] where this item appears. */
export function occurrencesFor(
  item: CadencedItem,
  fromKey: string,
  toKey_: string,
): string[] {
  if (item.dueDate) {
    return item.dueDate >= fromKey && item.dueDate <= toKey_ ? [item.dueDate] : [];
  }
  if (item.status === "completed") return [];

  const from = toNoon(fromKey);
  const to = toNoon(toKey_);
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) return [];

  const days: string[] = [];
  for (let t = from; t <= to; t += DAY_MS) {
    const d = new Date(t);
    if (item.cadence === "daily") days.push(toKey(t));
    else if (item.cadence === "weekly" && d.getUTCDay() === 1) days.push(toKey(t));
    else if (item.cadence === "monthly" && d.getUTCDate() === 1) days.push(toKey(t));
  }
  return days;
}

/** Group items by the day they occur — the calendar grid's shape. */
export function groupByDay<T extends CadencedItem>(
  items: T[],
  fromKey: string,
  toKey_: string,
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    for (const day of occurrencesFor(item, fromKey, toKey_)) {
      byDay.set(day, [...(byDay.get(day) ?? []), item]);
    }
  }
  return byDay;
}
