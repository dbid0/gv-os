import {
  countOf,
  NumberSection,
  NumberTile,
  usdOf,
} from "@/components/tracking/number-tiles";
import type { CashCatalogData } from "@/lib/tracking/cash-catalog-loader";

const HOUR_LABELS: Record<number, string> = { 0: "12a", 6: "6a", 12: "12p", 18: "6p" };

/** Every day key from first to last, inclusive (YYYY-MM-DD, calendar days). */
function daySpan(first: string, last: string): string[] {
  const out: string[] = [];
  const d = new Date(`${first}T12:00:00Z`);
  const end = new Date(`${last}T12:00:00Z`).getTime();
  while (d.getTime() <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const MAX_DAYS = 120;

function Bars({
  values,
  labels,
  titles,
}: {
  values: number[];
  labels: (string | null)[];
  titles: string[];
}) {
  const max = Math.max(...values, 0);
  return (
    <div>
      <div className="flex h-28 items-end gap-[2px]">
        {values.map((v, i) => (
          <div
            key={titles[i]}
            title={titles[i]}
            className="bg-secondary/60 relative flex h-full min-w-0 flex-1 items-end rounded-sm"
          >
            {v > 0 && (
              <div
                className="bg-success/80 w-full rounded-sm"
                style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="text-faint mt-1 flex gap-[2px] text-[10px]">
        {labels.map((l, i) => (
          <span
            key={titles[i]}
            className="min-w-0 flex-1 overflow-visible whitespace-nowrap"
          >
            {l ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Cash — the offer's payment feed read every way the reference catalog reads
 * it: collected (equal to the dashboard headline), payers and average order,
 * refunds, failures and what tag rules hid, cash with no call before it, the
 * hour of day and the day money lands, and cash by tag.
 */
export function CashSection({ data }: { data: CashCatalogData }) {
  const lede =
    "The offer's payment feed through its tag rules, the same cash as the Dashboard headline for the same window.";
  const c = data.catalog;
  if (!c) {
    return (
      <NumberSection title="Cash" lede={lede}>
        <p className="text-faint col-span-full text-xs">
          No payment feed yet: connect Stripe, or sync a tracking sheet with a Payment
          Log, and cash fills in here.
        </p>
      </NumberSection>
    );
  }

  const sourceWords =
    data.source === "stripe"
      ? "reported by Stripe"
      : "typed on the sheet's Payment Log";
  const spanDays =
    c.byDay.length > 0 ? daySpan(c.byDay[0].day, c.byDay[c.byDay.length - 1].day) : [];
  const shownDays = spanDays.slice(-MAX_DAYS);
  const dayCents = new Map(c.byDay.map((d) => [d.day, d.cents]));
  const hourPlaced = c.byHour.reduce((s, x) => s + x, 0);

  return (
    <div className="space-y-4">
      <NumberSection
        title="Cash"
        lede={`${lede} Every payment here was ${sourceWords}.`}
        footnote={`Average order = cash over the distinct people who paid (merged inboxes are one person; payments a rule keeps out of order size, and payers with no email or phone, are left out). Paid with no call first = cash from people with no booked call that started before they paid.${c.afterFeesEstimateCents === null ? " Cash after fees appears once the offer has a processor fee rate in Setup." : " Cash after fees is an estimate at the offer's fee rate, not the processor's statement."}`}
      >
        <NumberTile
          label="Cash collected"
          value={usdOf(c.cashCollectedCents)}
          sub={`${countOf(c.collectedCount)} payments`}
          tone="success"
        />
        <NumberTile
          label="People who paid"
          value={countOf(c.payers)}
          sub="distinct payers"
        />
        <NumberTile
          label="Average order"
          value={usdOf(c.aovCents)}
          sub="cash ÷ people who paid"
        />
        <NumberTile
          label="Paid with no call first"
          value={usdOf(c.noCallCents)}
          sub={`of ${usdOf(c.cashCollectedCents)} collected`}
        />
        <NumberTile
          label="Refunded"
          value={usdOf(c.refundedCents)}
          sub={`${countOf(c.refundedCount)} refunds`}
          tone={c.refundedCount > 0 ? "warning" : "default"}
        />
        <NumberTile
          label="Failed charges"
          value={countOf(c.failedCount)}
          sub="declined or failed"
          tone={c.failedCount > 0 ? "danger" : "default"}
        />
        <NumberTile
          label="Hidden by tag rules"
          value={usdOf(c.hidden.cents)}
          sub={`${countOf(c.hidden.count)} payments`}
        />
        <NumberTile
          label="Cash after fees"
          value={usdOf(c.afterFeesEstimateCents)}
          sub="estimate at your rate"
        />
      </NumberSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          aria-label="Cash by hour of day"
          className="card-grad rounded-xl border p-4"
        >
          <h3 className="text-sm font-medium">Cash by hour of day</h3>
          <p className="text-faint mb-3 text-[11px]">
            When money lands, on your clock.
            {c.unplaceableHourCents > 0 &&
              ` ${usdOf(c.unplaceableHourCents)} has a date but no time and isn't placed.`}
          </p>
          {hourPlaced === 0 ? (
            <p className="text-faint py-8 text-center text-xs">
              No payment in this window carries a time of day.
            </p>
          ) : (
            <Bars
              values={c.byHour}
              labels={c.byHour.map((_, h) => HOUR_LABELS[h] ?? null)}
              titles={c.byHour.map((v, h) => `${h}:00 — ${usdOf(v)}`)}
            />
          )}
        </section>

        <section aria-label="Cash by day" className="card-grad rounded-xl border p-4">
          <h3 className="text-sm font-medium">Cash by day</h3>
          <p className="text-faint mb-3 text-[11px]">
            {spanDays.length > MAX_DAYS
              ? `The last ${MAX_DAYS} days of this window.`
              : "Every day from the first payment to the last in this window."}
          </p>
          {shownDays.length === 0 ? (
            <p className="text-faint py-8 text-center text-xs">
              No cash collected in this window.
            </p>
          ) : (
            <Bars
              values={shownDays.map((d) => dayCents.get(d) ?? 0)}
              labels={shownDays.map((d, i) =>
                i === 0 || i === shownDays.length - 1 ? d.slice(5) : null,
              )}
              titles={shownDays.map((d) => `${d} — ${usdOf(dayCents.get(d) ?? 0)}`)}
            />
          )}
        </section>
      </div>

      {(c.byTag.length > 0 || c.hidden.count > 0) && (
        <section aria-label="Cash by tag" className="bg-card rounded-xl border">
          <div className="px-4 pt-3 pb-2">
            <h3 className="text-sm font-medium">Cash by tag</h3>
            <p className="text-faint text-[11px]">
              From the offer&apos;s payment tag rules. A payment with two tags counts
              under both, so tags can add up past the total.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="text-faint border-y text-[11px] tracking-wider uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    Tag
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Payments
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    Cash
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {c.byTag.map((t) => (
                  <tr key={t.tag}>
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      {t.tag}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {countOf(t.count)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {usdOf(t.cents)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th
                    scope="row"
                    className="text-muted-foreground px-4 py-2 text-left font-normal italic"
                  >
                    No tag
                  </th>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {usdOf(c.untaggedCents)}
                  </td>
                </tr>
                {c.hidden.count > 0 && (
                  <tr>
                    <th
                      scope="row"
                      className="text-muted-foreground px-4 py-2 text-left font-normal italic"
                    >
                      Hidden by rules (not in the total)
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {countOf(c.hidden.count)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {usdOf(c.hidden.cents)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
