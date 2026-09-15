import { countOf, pctOf } from "@/components/tracking/number-tiles";
import type { ConfirmerKey, ConfirmerRow } from "@/lib/calls/call-scoreboard";
import { cn } from "@/lib/utils";

const LABEL: Record<ConfirmerKey, string> = {
  setter: "Setter confirmed",
  dialer: "Dialer confirmed",
  dm_setter: "DM setter confirmed",
  unstated: "Confirmed, seat not recorded",
  none: "Never confirmed",
};

/**
 * Calls re-cut by who confirmed them — the confirmation split, per seat. The
 * "never confirmed" row is the baseline each seat's show rate is read against.
 */
export function ConfirmerTable({ rows }: { rows: ConfirmerRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Calls by who confirmed" className="bg-card rounded-xl border">
      <div className="px-4 pt-3 pb-2">
        <h3 className="text-sm font-medium">By who confirmed</h3>
        <p className="text-faint text-[11px]">
          Each call once: confirmed before it started, by the seat recorded on the
          confirmation; everything else is never confirmed. Show rate = shows ÷ (shows +
          no-shows); close rate = closes ÷ shows.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-faint border-y text-[11px] tracking-wider whitespace-nowrap uppercase">
            <tr>
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Confirmation
              </th>
              {[
                "Calls",
                "Cancelled",
                "Held",
                "Shows",
                "No-shows",
                "Closes",
                "Show rate",
              ].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 text-right font-medium">
                  {h}
                </th>
              ))}
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Close rate
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.key}>
                <th
                  scope="row"
                  className={cn(
                    "px-4 py-2 text-left font-normal",
                    (r.key === "none" || r.key === "unstated") &&
                      "text-muted-foreground italic",
                  )}
                >
                  {LABEL[r.key]}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">
                  {countOf(r.calls)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {countOf(r.cancelled)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{countOf(r.held)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {countOf(r.shows)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {countOf(r.noShows)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {countOf(r.closes)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pctOf(r.showRate)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {pctOf(r.closeRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
