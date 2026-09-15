/**
 * FACTS THAT LIVE IN A ROW'S PAYLOAD — read by header name, any casing.
 *
 * A sheet row keeps every column it didn't promote to a real field in its
 * payload, under the header exactly as the sheet wrote it. Two facts the call
 * numbers need sit there: who SET the call (an EOC tab with a "Closer Name"
 * column promotes the closer to `rep`, so "Setter Name" stays in the payload)
 * and how a close PAID ("Close Type" / "Deal Type").
 *
 * Headers are matched after normalizing (case, spacing, punctuation), in alias
 * order: the first alias the row has a non-blank value for wins.
 *
 * Pure: no database.
 */

import { normalizeHeading } from "@/lib/tracking/tabs";

export const SETTER_HEADERS = [
  "setter name",
  "setter",
  "appointment setter",
  "set by",
  "booked by",
  "dm setter",
] as const;

export const CLOSE_TYPE_HEADERS = [
  "close type",
  "deal type",
  "payment type",
  "payment plan",
  "type",
] as const;

/** The first non-blank payload value under any of the aliases, or null. */
export function payloadField(
  payload: Record<string, string> | null | undefined,
  aliases: readonly string[],
): string | null {
  if (!payload) return null;
  const byHeading = new Map<string, string>();
  for (const [header, value] of Object.entries(payload)) {
    const key = normalizeHeading(header);
    const clean = value.trim();
    if (clean !== "" && !byHeading.has(key)) byHeading.set(key, clean);
  }
  for (const alias of aliases) {
    const hit = byHeading.get(normalizeHeading(alias));
    if (hit !== undefined) return hit;
  }
  return null;
}
