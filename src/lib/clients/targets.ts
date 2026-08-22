import { dayKeyCT } from "@/lib/charts";
import { matchesSheetClient } from "@/lib/clients/sheet-aliases";

/**
 * Per-client monthly cash targets — pure. Actuals come from the sheet mirror
 * (the reconciled system of record): a deal counts toward the month its
 * literal yyyy-mm-dd close date falls in, judged against today's CT month.
 */

export function monthToDateCashCents(
  rows: { client: string; dateClosed: string; cashCents: number }[],
  slug: string,
  now: Date,
): number {
  const month = dayKeyCT(now).slice(0, 7);
  return rows
    .filter((r) => matchesSheetClient(slug, r.client))
    .filter((r) => r.dateClosed.trim().slice(0, 7) === month)
    .reduce((sum, r) => sum + r.cashCents, 0);
}

/**
 * Target input → integer cents. Empty clears (null); junk or absurd values
 * are "invalid" so the caller can refuse loudly instead of saving garbage.
 */
export function parseTargetDollars(input: string): number | null | "invalid" {
  const t = input.trim().replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return "invalid";
  return Math.round(n * 100);
}
