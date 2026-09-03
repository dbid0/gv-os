import Link from "next/link";

import { formatRate, type OfferFunnel } from "@/lib/tracking/funnel";

/**
 * This offer's funnel, counted in people.
 *
 * The bar widths are relative to the WIDEST stage, not to the first one: a
 * client whose Payment Log carries more buyers than its Applications tab
 * carries applicants is normal (DMs, webinars, referrals), and anchoring on
 * "applied" would draw bars wider than the chart.
 */
export function OfferFunnelPanel({
  funnel,
  slug,
}: {
  funnel: OfferFunnel;
  slug: string;
}) {
  const widest = Math.max(...funnel.stages.map((s) => s.leads), 1);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {funnel.stages.map((stage, i) => {
          const step = funnel.steps[i - 1];
          return (
            <div key={stage.key} className="flex items-center gap-3">
              <span className="text-muted-foreground w-24 shrink-0 text-xs">
                {stage.label}
              </span>
              <div className="bg-muted/40 h-7 min-w-0 flex-1 overflow-hidden rounded">
                <div
                  className="bg-brand/70 flex h-full items-center rounded px-2"
                  style={{ width: `${Math.max((stage.leads / widest) * 100, 3)}%` }}
                >
                  <span className="numeric text-xs font-semibold">{stage.leads}</span>
                </div>
              </div>
              {/* The numerator is shown, not just the rate: a bar reading
                  "Paid 60" beside "62% of 13" cannot be reconciled by the
                  reader — 62% is the share of the 13 who logged a deal and
                  then paid, while 60 is everyone who paid. Both are true and
                  only "8 of 13 (62%)" makes that legible. */}
              <span className="text-faint w-32 shrink-0 text-right text-xs">
                {step
                  ? `${step.advanced} of ${step.eligible} (${formatRate(step.rate)})`
                  : `${funnel.totalLeads} leads`}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-faint text-xs">
        Counted in people, not rows — one lead with three end-of-call reports is one
        call held. Each rate is measured only on the leads who reached the stage before
        it.
        {funnel.skipped > 0 && (
          <>
            {" "}
            {funnel.skipped} lead{funnel.skipped === 1 ? "" : "s"} appear part-way
            through without the earlier stages — usually a gap in the sheet, sometimes a
            channel it doesn&apos;t record.
          </>
        )}{" "}
        <Link href={`/w/${slug}/leads`} className="text-brand hover:underline">
          See every lead →
        </Link>
      </p>
    </div>
  );
}
