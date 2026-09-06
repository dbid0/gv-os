import { cents, formatUSD } from "@/lib/money";
import type { CashReconciliation } from "@/lib/tracking/cash-reconcile";

/**
 * Sold versus arrived.
 *
 * Two true numbers that are not the same number, shown side by side rather
 * than reconciled into one. The gap between them is the useful part: deals a
 * processor has never seen are either money that came by wire or Zelle, or a
 * payment plan still running, or a deal logged that has not actually been paid
 * — and only a person can tell those apart.
 */
export function CashReconciliationPanel({ r }: { r: CashReconciliation }) {
  const gap = r.dealsCents - r.processorCents;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Figure
          label="Closers logged"
          value={formatUSD(cents(r.dealsCents))}
          note="New Deals tab"
        />
        <Figure
          label="Processors recorded"
          value={formatUSD(cents(r.processorCents))}
          note="Payment Log"
          tone="text-success"
        />
        <Figure
          label={gap >= 0 ? "Logged but not processed" : "Processed beyond logged"}
          value={formatUSD(cents(Math.abs(gap)))}
          note={gap >= 0 ? "wires, Zelle, or still owed" : "payments with no deal"}
          tone={gap === 0 ? undefined : "text-warning"}
        />
      </div>

      {r.byProcessor.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.byProcessor.map((p) => (
            <span
              key={p.processor}
              className="bg-card text-muted-foreground rounded-md border px-2.5 py-1 text-xs"
            >
              {p.processor} · {formatUSD(cents(p.cents))}
              <span className="text-faint"> ({p.count})</span>
            </span>
          ))}
        </div>
      )}

      {r.unbackedDeals.length > 0 && (
        <div>
          <p className="text-faint text-xs">
            {r.unbackedDeals.length} deal{r.unbackedDeals.length === 1 ? "" : "s"} with
            no processor payment behind {r.unbackedDeals.length === 1 ? "it" : "them"} —{" "}
            {formatUSD(cents(r.unbackedCents))}
          </p>
          <ul className="mt-1.5 space-y-1">
            {r.unbackedDeals.slice(0, 6).map((d) => (
              <li
                key={`${d.email}-${d.cashCents}`}
                className="text-muted-foreground text-xs"
              >
                <span className="numeric">{formatUSD(cents(d.cashCents))}</span> ·{" "}
                {d.email}
                {d.program ? ` · ${d.program}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.unmatchedPaymentCount > 0 && (
        <p className="text-faint text-xs">
          {r.unmatchedPaymentCount} payment
          {r.unmatchedPaymentCount === 1 ? "" : "s"} worth{" "}
          {formatUSD(cents(r.unmatchedPaymentCents))} tie to no logged deal — usually a
          missing email on the row.
        </p>
      )}

      <p className="text-faint text-xs">
        These are never added together: most sales appear in both tabs, so the total
        would count the same money twice. The closers&apos; record is what was sold; the
        processors&apos; record is what arrived.
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <div className="bg-card rounded-lg border p-3">
      <p className="text-faint text-[11px] tracking-wide uppercase">{label}</p>
      <p className={`numeric mt-1 text-xl font-semibold ${tone ?? ""}`}>{value}</p>
      <p className="text-faint mt-0.5 text-xs">{note}</p>
    </div>
  );
}
