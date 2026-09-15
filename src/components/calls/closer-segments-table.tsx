import type { ReactNode } from "react";

import type { CloserSegment, CloserSegments } from "@/lib/calls/closer-segments";
import { cn } from "@/lib/utils";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);

function Row({ s, total = false }: { s: CloserSegment; total?: boolean }) {
  return (
    <tr className={cn(total && "bg-secondary/40 font-medium")}>
      <th
        scope="row"
        className={cn(
          "px-4 py-2 text-left font-normal",
          total ? "font-medium" : s.unattributed && "text-muted-foreground italic",
        )}
      >
        {s.closer}
      </th>
      <td className="px-3 py-2 text-right tabular-nums">{s.held}</td>
      <td className="px-3 py-2 text-right tabular-nums">{s.shows}</td>
      <td className="px-3 py-2 text-right tabular-nums">{s.noShows}</td>
      <td className="px-3 py-2 text-right tabular-nums">{s.closes}</td>
      <td className="px-3 py-2 text-right tabular-nums">{pct(s.showRate)}</td>
      <td className="px-4 py-2 text-right tabular-nums">{pct(s.closeRate)}</td>
    </tr>
  );
}

/**
 * The call log re-cut per closer or setter. Every row is the same held calls, so the
 * rows add up to the total line — calls nobody has reported on, or whose
 * report names no closer, get their own rows instead of vanishing.
 */
export function CloserSegmentsTable({
  segments,
  windowChips,
  dimension = "closer",
  cutNav,
}: {
  segments: CloserSegments;
  /** The date-window control, rendered in the panel header. */
  windowChips?: ReactNode;
  /** Whose name keys the rows. */
  dimension?: "closer" | "setter";
  /** The closer/setter toggle, rendered in the panel header. */
  cutNav?: ReactNode;
}) {
  const person = dimension === "setter" ? "Setter" : "Closer";
  if (segments.total.held === 0 && !windowChips) return null;
  return (
    <section aria-labelledby="by-closer" className="bg-card rounded-xl border">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3 pb-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="by-closer" className="text-sm font-medium">
            By {person.toLowerCase()}
          </h2>
          {cutNav}
          {windowChips}
        </div>
        <p className="text-faint text-[11px]">
          Held calls only. Show rate = shows ÷ (shows + no-shows); close rate = closes ÷
          shows.
        </p>
      </div>
      {segments.total.held === 0 ? (
        <p className="text-faint border-t px-4 py-6 text-center text-sm">
          No held calls in this window.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-faint border-y text-[11px] tracking-wider whitespace-nowrap uppercase">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  {person}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Held
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Shows
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  No-shows
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Closes
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Show rate
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Close rate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {segments.rows.map((s) => (
                <Row key={s.closer} s={s} />
              ))}
            </tbody>
            <tfoot className="border-t">
              <Row s={segments.total} total />
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
