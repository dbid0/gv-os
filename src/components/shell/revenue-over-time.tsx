"use client";

import { RevenueChart } from "@/components/ui/revenue-chart";
import { useHomeScopeKey } from "@/lib/client-state";

/**
 * The "Revenue over time" panel body. It draws the SAME window+scope the hero
 * shows — the hero broadcasts its active key through the client-side scope
 * store, and this panel looks the series up from the same precomputed set.
 * Until the first toggle (or when the URL carries a dragged custom range) it
 * renders the server-chosen series it was handed.
 */
export function RevenueOverTime({
  seriesByKey,
  initialKey,
  initialSeries,
}: {
  seriesByKey: Record<string, { day: string; cents: number }[]>;
  initialKey: string;
  initialSeries: { day: string; cents: number }[];
}) {
  const key = useHomeScopeKey(initialKey);
  const series = seriesByKey[key] ?? initialSeries;
  return <RevenueChart series={series} />;
}
