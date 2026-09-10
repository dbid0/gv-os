/**
 * The counted-source rule — the anti-double-count rail for the call funnel.
 *
 * Several booking providers can mirror the same real-world calls (a Calendly
 * event also lands as a Close meeting). Counting both doubles every funnel
 * stat. The client row lists which provider(s) COUNT; everything else still
 * syncs (history is kept) but stays out of the numbers.
 *
 * Null or empty = all sources count — the single-source reality, and the
 * safe default: the rule only bites once someone deliberately narrows it.
 */

export type CountedBooking = { provider: string };

export function filterCountedBookings<T extends CountedBooking>(
  bookings: T[],
  countedSources: string[] | null | undefined,
): T[] {
  if (!countedSources || countedSources.length === 0) return bookings;
  const counted = new Set(countedSources.map((s) => s.trim().toLowerCase()));
  return bookings.filter((b) => counted.has(b.provider.trim().toLowerCase()));
}
