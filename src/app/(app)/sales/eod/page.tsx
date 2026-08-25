import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { listActivityReports } from "@/lib/sales/queries";
import { ROLE_LABEL } from "@/lib/sales/eod-fields";
import { cn } from "@/lib/utils";

export const metadata = { title: "EOD Reports - GV OS" };
export const dynamic = "force-dynamic";

const CADENCE_TABS = [
  { key: "eod", label: "Daily (EOD)" },
  { key: "bod", label: "Beginning of Day" },
];

// The columns the history leads with — a common slice of the activity vocabulary.
const COLS: { key: string; label: string }[] = [
  { key: "dials", label: "Dials" },
  { key: "connects", label: "Connects" },
  { key: "sets_booked", label: "Sets" },
  { key: "calls_taken", label: "Calls" },
  { key: "shows", label: "Shows" },
  { key: "follow_up_calls", label: "Follow-ups" },
];

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function showRate(shows: number, sets: number): string {
  if (!sets) return "—";
  return `${((shows / sets) * 100).toFixed(0)}%`;
}

export default async function EodReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind = "eod" } = await searchParams;
  const active = CADENCE_TABS.some((t) => t.key === kind) ? kind : "eod";
  const rows = await listActivityReports(active);

  const totals: Record<string, number> = {};
  for (const r of rows) {
    if (r.metrics.day_off) continue;
    for (const c of COLS)
      totals[c.key] = (totals[c.key] ?? 0) + (r.metrics[c.key] ?? 0);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">EOD Reports</h2>
          <p className="text-muted-foreground text-xs">
            Daily submission history. {rows.length}{" "}
            {rows.length === 1 ? "report" : "reports"} in range.
          </p>
        </div>
        <div className="bg-secondary/60 inline-flex items-center gap-1 rounded-xl border p-1">
          {CADENCE_TABS.map((t) => (
            <Link
              key={t.key}
              href={`/sales/eod?kind=${t.key}`}
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
        <Panel title="No reports yet">
          <p className="text-muted-foreground text-sm">
            Submissions show up here as reps file their EODs. Use{" "}
            <span className="text-foreground">Submit EOD</span> to file one.
          </p>
        </Panel>
      ) : (
        <Panel padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-[11px] tracking-wider uppercase">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Rep</th>
                  <th className="px-4 py-2.5 font-medium">Team</th>
                  {COLS.map((c) => (
                    <th key={c.key} className="px-4 py-2.5 text-right font-medium">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-medium">Show %</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-secondary/40 border-b text-xs font-medium">
                  <td className="px-4 py-2.5" colSpan={3}>
                    Totals · {rows.length} {rows.length === 1 ? "report" : "reports"}
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className="numeric px-4 py-2.5 text-right">
                      {(totals[c.key] ?? 0).toLocaleString()}
                    </td>
                  ))}
                  <td className="numeric px-4 py-2.5 text-right">
                    {showRate(totals.shows ?? 0, totals.sets_booked ?? 0)}
                  </td>
                </tr>
                {rows.map((r) => {
                  const off = Boolean(r.metrics.day_off);
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-secondary/40 border-b transition-colors last:border-0"
                    >
                      <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                        {fmtDate(new Date(r.reportDate))}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-medium">{r.repName ?? "—"}</span>
                        {r.role && (
                          <span className="text-faint ml-1.5 text-xs">
                            {ROLE_LABEL[r.role] ?? r.role}
                          </span>
                        )}
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                        {r.teamName ?? "—"}
                      </td>
                      {off ? (
                        <td
                          className="text-faint px-4 py-2.5 text-center"
                          colSpan={COLS.length + 1}
                        >
                          <StatusPill tone="muted">Day off</StatusPill>
                        </td>
                      ) : (
                        <>
                          {COLS.map((c) => (
                            <td
                              key={c.key}
                              className="numeric text-muted-foreground px-4 py-2.5 text-right"
                            >
                              {r.metrics[c.key] != null
                                ? r.metrics[c.key].toLocaleString()
                                : "–"}
                            </td>
                          ))}
                          <td className="numeric px-4 py-2.5 text-right">
                            {showRate(r.metrics.shows ?? 0, r.metrics.sets_booked ?? 0)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
