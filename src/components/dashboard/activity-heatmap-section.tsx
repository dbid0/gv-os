import "server-only";

import { ActivityHeatmap } from "@/components/ui/activity-heatmap";
import { Panel } from "@/components/ui/panel";
import { buildActivityHeatmap } from "@/lib/activity-heatmap";
import { listTransactions } from "@/lib/transactions/queries";

/**
 * The 13-week "Cash by day" heatmap, streamed behind its own Suspense boundary.
 *
 * It reads the SAME backlog the headline uses, but listTransactions is wrapped
 * in React cache() (request-scoped dedupe), so this re-read resolves from the
 * parent's already-in-flight query — one DB round trip for the whole page, not
 * two. What actually gets deferred is this panel's own render (the 13×7 grid
 * build + paint), so it streams in after the fast shell instead of blocking it.
 * The model math is identical to what the monolithic page computed inline.
 */
export async function ActivityHeatmapSection({ todayKey }: { todayKey: string }) {
  const { rows: backlog } = await listTransactions({});
  return (
    <Panel title="Cash by day">
      <ActivityHeatmap
        model={buildActivityHeatmap(
          backlog
            .filter((r) => r.direction === "in")
            .map((r) => ({ day: r.occurredOn, value: r.cashCents })),
          todayKey,
          13,
        )}
      />
    </Panel>
  );
}
