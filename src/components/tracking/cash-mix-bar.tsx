import type { CashMix } from "@/lib/tracking/cash-mix";

/**
 * The cash mix as one bar — new money, same-month recurring, and money from
 * payers past their first month (retention made visible). Server-rendered.
 */
export function CashMixBar({ mix, label }: { mix: CashMix; label: string }) {
  const total = mix.newCents + mix.recurringSameMonthCents + mix.afterFirstMonthCents;
  if (total <= 0) {
    return (
      <p className="text-faint mt-2 text-xs">
        No placeable cash in the {label.toLowerCase()}.
      </p>
    );
  }
  const pct = (c: number) => (c / total) * 100;
  const usd = (c: number) =>
    `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return (
    <>
      <div className="bg-secondary mt-3 flex h-2.5 w-full overflow-hidden rounded-full">
        <div className="bg-success h-full" style={{ width: `${pct(mix.newCents)}%` }} />
        <div
          className="bg-brand h-full"
          style={{ width: `${pct(mix.recurringSameMonthCents)}%` }}
        />
        <div
          className="h-full"
          style={{
            width: `${pct(mix.afterFirstMonthCents)}%`,
            background: "var(--warning)",
          }}
        />
      </div>
      <div className="text-faint mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
        <span>
          <span className="bg-success mr-1.5 inline-block size-2 rounded-full align-middle" />
          New {usd(mix.newCents)} · {mix.newPayers} payer
          {mix.newPayers === 1 ? "" : "s"}
        </span>
        <span>
          <span className="bg-brand mr-1.5 inline-block size-2 rounded-full align-middle" />
          Same-month recurring {usd(mix.recurringSameMonthCents)}
        </span>
        <span>
          <span
            className="mr-1.5 inline-block size-2 rounded-full align-middle"
            style={{ background: "var(--warning)" }}
          />
          After the 1st month {usd(mix.afterFirstMonthCents)} · {mix.returningPayers}{" "}
          returning
        </span>
      </div>
    </>
  );
}
