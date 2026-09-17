import { Fragment } from "react";

import { Money } from "@/components/ui/metric";
import { cents } from "@/lib/money";
import type { AgencySummary, SummaryRow } from "@/lib/accounting/agency-summary";
import { cn } from "@/lib/utils";

/**
 * The agency book, laid out the way Daniel and Gus already read it in the
 * Master Finance Sheet: three periods across, two sections down, the sheet's
 * own row names in the sheet's own order.
 *
 * The month columns are LABELLED with the months they are, not "this" and
 * "last" — on the 1st of a month those words are ambiguous exactly when the
 * numbers matter most.
 *
 * A balance (AR, unpaid payouts) prints only in All time, because that is what
 * the sheet does and it is right: a month's slice of a debt is not a number.
 * Its monthly cells are left blank rather than dashed, so the eye reads them
 * as "not applicable" instead of "unknown".
 */

const MONTH_LABEL = (key: string) =>
  new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });

function Cell({ row, value }: { row: SummaryRow; value: number | null }) {
  if (value === null) {
    return (
      <td className="text-faint px-4 py-2.5 text-right">
        {row.balanceOnly ? "" : "—"}
      </td>
    );
  }
  return (
    <td className="px-4 py-2.5 text-right tabular-nums">
      {row.kind === "money" ? (
        <Money amount={cents(value)} />
      ) : (
        value.toLocaleString("en-US")
      )}
    </td>
  );
}

export function AgencyBook({ summary }: { summary: AgencySummary }) {
  return (
    <section className="bg-card overflow-hidden rounded-xl border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-faint border-b text-[11px] tracking-wider uppercase">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">
                Metric
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                {MONTH_LABEL(summary.thisMonthKey)}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                {MONTH_LABEL(summary.lastMonthKey)}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                All time
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.sections.map((section) => (
              <Fragment key={section.label}>
                <tr className="bg-secondary/40">
                  <th
                    scope="colgroup"
                    colSpan={4}
                    className="text-muted-foreground px-4 py-2 text-left text-[11px] font-medium tracking-wider uppercase"
                  >
                    {section.label}
                  </th>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.key} className="border-t">
                    <th
                      scope="row"
                      className={cn(
                        "px-4 py-2.5 text-left font-normal",
                        row.balanceOnly && "text-muted-foreground",
                      )}
                    >
                      {row.label}
                    </th>
                    <Cell row={row} value={row.thisMonth} />
                    <Cell row={row} value={row.lastMonth} />
                    <Cell row={row} value={row.allTime} />
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
