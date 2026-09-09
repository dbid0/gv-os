import { Panel } from "@/components/ui/panel";
import type { OfferMetrics } from "@/lib/tracking/offer-metrics";
import { displayName } from "@/lib/text";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/**
 * The rep leaderboard band — the reference guarantee, stated on the surface:
 * every column is the engine re-cut per rep, so the rows always reconcile to
 * the page totals. Activity nobody claimed shows as its own Unassigned row
 * rather than silently inflating someone's line or vanishing.
 */
export function LeaderboardBand({
  metrics,
  repName,
}: {
  metrics: OfferMetrics;
  repName: Map<string, string>;
}) {
  const { activity, board } = metrics;
  if (activity.logged === 0) return null;

  const assignedCalls = board.reduce((s, r) => s + r.calls, 0);
  const assignedSales = board.reduce((s, r) => s + r.sales, 0);
  const assignedShows = board.reduce((s, r) => s + r.shows, 0);
  const unassigned = {
    calls: activity.calls - assignedCalls,
    shows: activity.shows - assignedShows,
    sales: activity.sales - assignedSales,
  };

  return (
    <Panel
      title="Leaderboard"
      aside={
        <span className="text-faint text-xs">
          the engine re-cut per rep — always reconciles to the totals
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-faint text-left text-[11px] tracking-wider uppercase">
              <th className="py-1.5 pr-3 font-medium">Rep</th>
              <th className="px-3 py-1.5 text-right font-medium">Calls</th>
              <th className="px-3 py-1.5 text-right font-medium">Shows</th>
              <th className="px-3 py-1.5 text-right font-medium">Show rate</th>
              <th className="px-3 py-1.5 text-right font-medium">Closes</th>
              <th className="px-3 py-1.5 text-right font-medium">Close rate</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {board.map((r) => (
              <tr key={r.repId}>
                <td className="text-foreground py-2 pr-3 font-medium">
                  {displayName(repName.get(r.repId) ?? "Unknown rep")}
                </td>
                <td className="numeric px-3 py-2 text-right">{r.calls}</td>
                <td className="numeric px-3 py-2 text-right">{r.shows}</td>
                <td className="numeric px-3 py-2 text-right">{pct(r.showRate)}</td>
                <td className="numeric px-3 py-2 text-right">{r.sales}</td>
                <td className="numeric px-3 py-2 text-right">{pct(r.closeRate)}</td>
              </tr>
            ))}
            {unassigned.calls > 0 && (
              <tr className="text-muted-foreground">
                <td className="py-2 pr-3">Unassigned</td>
                <td className="numeric px-3 py-2 text-right">{unassigned.calls}</td>
                <td className="numeric px-3 py-2 text-right">{unassigned.shows}</td>
                <td className="numeric px-3 py-2 text-right">—</td>
                <td className="numeric px-3 py-2 text-right">{unassigned.sales}</td>
                <td className="numeric px-3 py-2 text-right">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
