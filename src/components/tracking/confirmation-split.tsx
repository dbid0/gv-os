import { CheckCircle2, CircleDashed } from "lucide-react";

import { confirmationLift, type GroupRates } from "@/lib/crm/confirmation-rates";
import type { ConfirmationMetrics } from "@/lib/tracking/offer-metrics";
import { cn } from "@/lib/utils";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);

function points(lift: number | null): string | null {
  if (lift === null) return null;
  const rounded = Math.round(lift);
  if (rounded === 0) return "no difference";
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
}

function RateLine({
  label,
  value,
  numerator,
  denominator,
  unit,
}: {
  label: string;
  value: number | null;
  numerator: number;
  denominator: number;
  unit: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right">
        <span className="text-foreground font-mono text-lg font-semibold tabular-nums">
          {pct(value)}
        </span>
        <span className="text-faint ml-1.5 text-[11px] tabular-nums">
          {denominator === 0
            ? `no ${unit} yet`
            : `${numerator} of ${denominator} ${unit}`}
        </span>
      </span>
    </div>
  );
}

function Group({
  title,
  icon: Icon,
  tone,
  rates,
}: {
  title: string;
  icon: typeof CheckCircle2;
  tone: string;
  rates: GroupRates;
}) {
  return (
    <div className="bg-secondary/30 space-y-2 rounded-lg border p-3.5">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Icon className={cn("size-3.5", tone)} /> {title}
        <span className="text-faint ml-auto font-normal tabular-nums">
          {rates.held} held
        </span>
      </p>
      <RateLine
        label="Show rate"
        value={rates.showRate}
        numerator={rates.shows}
        denominator={rates.shows + rates.noShows}
        unit="resolved"
      />
      <RateLine
        label="Close rate"
        value={rates.closeRate}
        numerator={rates.closes}
        denominator={rates.shows}
        unit="shows"
      />
    </div>
  );
}

/**
 * Does confirming work? — the offer's held calls split by whether they were
 * confirmed before they started, each side with its show and close rate and
 * the counts behind them. The engine owns every number; this only lays it out.
 * Past calls with no end-of-call report sit outside the rates and are named.
 */
export function ConfirmationSplitPanel({
  confirmation,
}: {
  confirmation: ConfirmationMetrics;
}) {
  const { rates } = confirmation;
  const showLift = rates
    ? points(confirmationLift(rates.confirmed.showRate, rates.unconfirmed.showRate))
    : null;
  const closeLift = rates
    ? points(confirmationLift(rates.confirmed.closeRate, rates.unconfirmed.closeRate))
    : null;

  return (
    <section className="card-grad @container rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
          Confirmed before the call
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          <span className="text-foreground font-mono font-semibold">
            {confirmation.everConfirmed}
          </span>{" "}
          of {confirmation.ofBookings} booked
        </p>
      </div>

      {rates ? (
        <>
          <div className="mt-3 grid gap-3 @xl:grid-cols-2">
            <Group
              title="Confirmed"
              icon={CheckCircle2}
              tone="text-success"
              rates={rates.confirmed}
            />
            <Group
              title="Not confirmed"
              icon={CircleDashed}
              tone="text-muted-foreground"
              rates={rates.unconfirmed}
            />
          </div>
          {(showLift || closeLift) && (
            <p className="text-muted-foreground mt-3 text-xs">
              Confirmed vs not: show rate{" "}
              <span className="text-foreground font-medium">{showLift ?? "—"}</span>,
              close rate{" "}
              <span className="text-foreground font-medium">{closeLift ?? "—"}</span>.
            </p>
          )}
          {rates.unreported > 0 && (
            <p className="text-warning mt-2 text-xs">
              {rates.unreported} past call{rates.unreported === 1 ? "" : "s"} with no
              end-of-call report {rates.unreported === 1 ? "is" : "are"} left out of
              these rates.
            </p>
          )}
        </>
      ) : (
        <p className="text-faint mt-2 text-xs">
          Show and close rates by confirmation appear once end-of-call reports sync from
          the tracking sheet.
        </p>
      )}

      {confirmation.confirmedThenCancelled > 0 && (
        <p className="text-warning mt-2 text-xs">
          {confirmation.confirmedThenCancelled} confirmed, then cancelled anyway
        </p>
      )}
      <p className="text-faint mt-3 text-[11px]">
        A confirmation counts only when recorded before the call&apos;s start. Show rate
        = shows ÷ (shows + no-shows); close rate = closes ÷ shows.
      </p>
    </section>
  );
}
