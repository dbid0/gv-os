/**
 * The feed's most common values, offered as one-click suggestions in the tag
 * rule editor so a rule is written against words the feed actually contains.
 * Pure.
 */

export type ValueCount = { value: string; count: number };

/** Most frequent non-empty values, case-folded for counting, first spelling kept. */
export function topValues(
  values: (string | null | undefined)[],
  limit = 8,
): ValueCount[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    const hit = counts.get(key);
    if (hit) hit.count += 1;
    else counts.set(key, { value: t, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}
