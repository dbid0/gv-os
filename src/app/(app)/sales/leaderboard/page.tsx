import Link from "next/link";

import { SummaryStrip, type OfferBreakdown } from "@/components/sales/summary-strip";
import { Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { cents } from "@/lib/money";
import { compactUsd } from "@/lib/revenue-chart";
import { getLeaderboard } from "@/lib/sales/queries";
import { ROLE_LABEL } from "@/lib/sales/eod-fields";
import { cn } from "@/lib/utils";

export const metadata = { title: "Leaderboard - GV OS" };
export const dynamic = "force-dynamic";

const ROLE_TABS = [
  { key: "", label: "All Roles" },
  { key: "closer", label: "Closers" },
  { key: "setter", label: "Setters" },
  { key: "dm_setter", label: "DM Setters" },
];

const pct = (num: number, den: number) =>
  den ? `${((num / den) * 100).toFixed(0)}%` : "—";

export default async function SalesLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role = "" } = await searchParams;
  const active = ROLE_TABS.some((t) => t.key === role) ? role : "";
  const rows = await getLeaderboard(active || undefined);
  const ranked = rows.some(
    (r) => r.cashCents > 0 || r.dealsClosed > 0 || r.shows > 0 || r.dials > 0,
  );

  // Whole-book roll-up over the (role-filtered) reps, then the per-offer split.
  const totalCash = rows.reduce((s, r) => s + r.cashCents, 0);
  const totalDeals = rows.reduce((s, r) => s + r.dealsClosed, 0);
  const totalShows = rows.reduce((s, r) => s + r.shows, 0);
  const totalSets = rows.reduce((s, r) => s + r.setsBooked, 0);
  const byOffer = new Map<string, { cash: number; deals: number }>();
  for (const r of rows) {
    const name = r.teamName ?? "Unassigned";
    const cur = byOffer.get(name) ?? { cash: 0, deals: 0 };
    cur.cash += r.cashCents;
    cur.deals += r.dealsClosed;
    byOffer.set(name, cur);
  }
  const perOffer: OfferBreakdown[] = [...byOffer.entries()]
    .sort((a, b) => b[1].cash - a[1].cash)
    .map(([name, v]) => ({
      name,
      detail: `${compactUsd(v.cash)} · ${v.deals} ${v.deals === 1 ? "deal" : "deals"}`,
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Leaderboard</h2>
          <p className="text-muted-foreground text-xs">
            Team performance rankings, off EOD activity and closed deals.
          </p>
        </div>
        <div className="bg-secondary/60 inline-flex items-center gap-1 rounded-xl border p-1">
          {ROLE_TABS.map((t) => (
            <Link
              key={t.key}
              href={t.key ? `/sales/leaderboard?role=${t.key}` : "/sales/leaderboard"}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                active === t.key
                  ? "bg-card text-foreground border-border-strong elev-card border font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Panel title="No reps yet">
          <p className="text-muted-foreground text-sm">
            Add reps to a team, then rankings appear here as their EODs and deals flow
            in.
          </p>
        </Panel>
      ) : (
        <>
          <SummaryStrip
            stats={[
              { label: "Reps ranked", value: String(rows.length), tone: "brand" },
              { label: "Deals closed", value: String(totalDeals) },
              {
                label: "Cash collected",
                value: <Money amount={cents(totalCash)} />,
                tone: "success",
              },
              {
                label: "Close rate",
                value: totalShows ? pct(totalDeals, totalShows) : "—",
              },
            ]}
            perOffer={perOffer}
          />
          {/* show rate lives on the strip too when there is set activity */}
          {totalSets > 0 && (
            <p className="text-faint -mt-3 text-xs">
              Show rate across {rows.length} {rows.length === 1 ? "rep" : "reps"}:{" "}
              {pct(totalShows, totalSets)} · {totalSets.toLocaleString()} sets →{" "}
              {totalShows.toLocaleString()} shows
            </p>
          )}
          <Panel padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-faint border-b text-left text-[11px] tracking-wider uppercase">
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-4 py-2.5 font-medium">Rep</th>
                    <th className="px-4 py-2.5 font-medium">Team</th>
                    <th className="px-4 py-2.5 text-right font-medium">Dials</th>
                    <th className="px-4 py-2.5 text-right font-medium">Sets</th>
                    <th className="px-4 py-2.5 text-right font-medium">Shows</th>
                    <th className="px-4 py-2.5 text-right font-medium">Deals</th>
                    <th className="px-4 py-2.5 text-right font-medium">Cash</th>
                    <th className="px-4 py-2.5 text-right font-medium">Show %</th>
                    <th className="px-4 py-2.5 text-right font-medium">Close %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.repId}
                      className="hover:bg-secondary/40 border-b transition-colors last:border-0"
                    >
                      <td className="text-faint numeric px-4 py-2.5">
                        {ranked ? i + 1 : "–"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-medium">{r.name}</span>
                        <span className="text-faint ml-1.5 text-xs">
                          {ROLE_LABEL[r.role] ?? r.role}
                        </span>
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                        {r.teamName ?? "—"}
                      </td>
                      <td className="numeric text-muted-foreground px-4 py-2.5 text-right">
                        {r.dials.toLocaleString()}
                      </td>
                      <td className="numeric text-muted-foreground px-4 py-2.5 text-right">
                        {r.setsBooked.toLocaleString()}
                      </td>
                      <td className="numeric text-muted-foreground px-4 py-2.5 text-right">
                        {r.shows.toLocaleString()}
                      </td>
                      <td className="numeric px-4 py-2.5 text-right font-medium">
                        {r.dealsClosed}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Money amount={r.cashCents} />
                      </td>
                      <td className="numeric text-muted-foreground px-4 py-2.5 text-right">
                        {pct(r.shows, r.setsBooked)}
                      </td>
                      <td className="numeric text-muted-foreground px-4 py-2.5 text-right">
                        {pct(r.dealsClosed, r.shows)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
