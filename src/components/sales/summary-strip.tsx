import type { ReactNode } from "react";

import { Kpi } from "@/components/ui/metric";

export interface SummaryStat {
  label: string;
  value: ReactNode;
  tone?: "default" | "brand" | "success" | "warning" | "danger";
}

export interface OfferBreakdown {
  /** The offer/client name — bolded on the chip. */
  name: string;
  /** The trailing detail, e.g. "3 deals · $12,400". */
  detail: string;
}

/**
 * The cross-offer roll-up that leads a Sales section (Daniel's ask: "each
 * section shows an average across the offers on top, then the in-depth data
 * below"). A small band of headline KPIs, then an optional per-offer chip row
 * so the whole book and each offer read at a glance before the detail table.
 */
export function SummaryStrip({
  stats,
  perOffer,
  breakdownLabel = "By offer",
}: {
  stats: SummaryStat[];
  perOffer?: OfferBreakdown[];
  breakdownLabel?: string;
}) {
  return (
    <section className="card-grad space-y-4 rounded-xl border p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Kpi key={s.label} label={s.label} value={s.value} tone={s.tone} />
        ))}
      </div>
      {perOffer && perOffer.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-faint mb-2 text-[11px] font-medium tracking-wider uppercase">
            {breakdownLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {perOffer.map((o) => (
              <span
                key={o.name}
                className="text-muted-foreground rounded-full border px-2.5 py-1 text-xs"
              >
                <span className="text-foreground font-medium">{o.name}</span> ·{" "}
                {o.detail}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
