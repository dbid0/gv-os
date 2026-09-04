import {
  activityRates,
  type ActivityCounts,
  type RepActivity,
} from "@/lib/tracking/activity";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const num = (v: number | undefined) =>
  v === undefined ? "—" : v.toLocaleString("en-US");

/**
 * The floor, rep by rep.
 *
 * A dash is not a zero anywhere in this table. A rep whose form does not ask
 * for dials shows "—" under Dials, because the DM setter form genuinely has no
 * such field; printing 0 would say they made no calls.
 */
export function ActivityTable({
  reps,
  totals,
}: {
  reps: RepActivity[];
  totals: ActivityCounts;
}) {
  if (reps.length === 0) {
    return (
      <p className="text-faint py-8 text-center text-sm">
        No end-of-day forms on this sheet yet.
      </p>
    );
  }
  const floor = activityRates(totals);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-faint border-b text-xs uppercase">
          <tr>
            <th className="py-2 pr-4 text-left font-medium">Rep</th>
            <th className="py-2 pr-4 text-right font-medium">Days</th>
            <th className="py-2 pr-4 text-right font-medium">Dials</th>
            <th className="py-2 pr-4 text-right font-medium">Contacts</th>
            <th className="py-2 pr-4 text-right font-medium">Booked</th>
            <th className="py-2 pr-4 text-right font-medium">Showed</th>
            <th className="py-2 pr-4 text-right font-medium">Offers</th>
            <th className="py-2 pr-4 text-right font-medium">Closed</th>
            <th className="py-2 pr-4 text-right font-medium">Show</th>
            <th className="py-2 pr-4 text-right font-medium">Close</th>
          </tr>
        </thead>
        <tbody>
          {reps.map((r) => {
            const rates = activityRates(r.totals);
            return (
              <tr key={r.rep} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{r.rep}</td>
                <td className="numeric text-muted-foreground py-2 pr-4 text-right">
                  {r.days}
                </td>
                <td className="numeric py-2 pr-4 text-right">{num(r.totals.dials)}</td>
                <td className="numeric py-2 pr-4 text-right">
                  {num(r.totals.contacts)}
                </td>
                <td className="numeric py-2 pr-4 text-right">
                  {num(r.totals.apptsSet)}
                </td>
                <td className="numeric py-2 pr-4 text-right">{num(r.totals.showed)}</td>
                <td className="numeric py-2 pr-4 text-right">
                  {num(r.totals.offersMade)}
                </td>
                <td className="numeric py-2 pr-4 text-right">
                  {num(r.totals.dealsClosed)}
                </td>
                <td className="numeric text-muted-foreground py-2 pr-4 text-right">
                  {pct(rates.show)}
                </td>
                <td className="numeric text-muted-foreground py-2 pr-4 text-right">
                  {pct(rates.close)}
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2">
            <td className="py-2 pr-4 text-xs font-semibold uppercase">Floor</td>
            <td />
            <td className="numeric py-2 pr-4 text-right font-semibold">
              {num(totals.dials)}
            </td>
            <td className="numeric py-2 pr-4 text-right font-semibold">
              {num(totals.contacts)}
            </td>
            <td className="numeric py-2 pr-4 text-right font-semibold">
              {num(totals.apptsSet)}
            </td>
            <td className="numeric py-2 pr-4 text-right font-semibold">
              {num(totals.showed)}
            </td>
            <td className="numeric py-2 pr-4 text-right font-semibold">
              {num(totals.offersMade)}
            </td>
            <td className="numeric py-2 pr-4 text-right font-semibold">
              {num(totals.dealsClosed)}
            </td>
            <td className="numeric py-2 pr-4 text-right font-semibold">
              {pct(floor.show)}
            </td>
            <td className="numeric py-2 pr-4 text-right font-semibold">
              {pct(floor.close)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
