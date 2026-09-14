import "server-only";

import { RepTrendsPanel } from "@/components/shell/rep-trends-panel";
import { getRepTrends } from "@/lib/sales/rep-trends-query";

/**
 * The Rep performance trends panel, streamed behind its own Suspense boundary.
 *
 * getRepTrends gathers 60 days of activity + deals across three tables and is
 * used NOWHERE else on the dashboard — so deferring it here takes it off the
 * critical path entirely: the headline + KPI tiles no longer wait on it before
 * painting. Same query, same numbers, just no longer blocking first paint.
 */
export async function RepTrendsSection({ todayKey }: { todayKey: string }) {
  const trends = await getRepTrends(todayKey);
  return <RepTrendsPanel trends={trends} />;
}
