import Link from "next/link";

import { FunnelGraph } from "@/components/tracking/funnel-graph";
import { Money } from "@/components/ui/metric";
import { cents } from "@/lib/money";
import { type OfferFunnel } from "@/lib/tracking/funnel";

/**
 * This offer's funnel, counted in people.
 *
 * The bar widths are relative to the WIDEST stage, not to the first one: a
 * client whose Payment Log carries more buyers than its Applications tab
 * carries applicants is normal (DMs, webinars, referrals), and anchoring on
 * "applied" would draw bars wider than the chart.
 *
 * THE TWO TICKETS ARE STRUCTURE, NOT A FOOTNOTE. An offer selling a $49
 * subscription beside a $5,000 program has two businesses inside one "Paid"
 * bar. That used to be explained in a paragraph under the chart; a split you
 * have to read a paragraph to see is not a split. It is now two rows, at the
 * offer's own line, and the paragraph is gone.
 *
 * Only the notes that change how a number is READ survive, one line each and
 * only when there is something to say.
 */
export function OfferFunnelPanel({
  funnel,
  slug,
}: {
  funnel: OfferFunnel;
  slug: string;
}) {
  // An offer nobody has bought yet has nothing to split: two "0 buyers" boxes
  // would be two more things to read past on the way to the chart.
  const buyers =
    funnel.buyers && funnel.buyers.low.count + funnel.buyers.high.count > 0
      ? funnel.buyers
      : null;

  return (
    <div className="space-y-4">
      <FunnelGraph funnel={funnel} />

      {buyers && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border">
          <TicketBand
            label="High ticket"
            count={buyers.high.count}
            amount={buyers.high.cents}
            emphasis
          />
          <TicketBand
            label={`Low ticket — to ${dollars(buyers.thresholdCents)}`}
            count={buyers.low.count}
            amount={buyers.low.cents}
          />
        </div>
      )}

      <p className="text-faint space-y-1 text-xs">
        {/* With a line set, the bands above say this. Without one, this is the
            only thing that stops "more paid than closed" reading as broken
            tracking rather than as the offer's shape. */}
        {!buyers && funnel.paidWithoutDeal > 0 && (
          <span className="block">
            {funnel.paidWithoutDeal} paid with no deal logged — set this offer&apos;s
            low-ticket line in Settings to split them out.
          </span>
        )}
        {funnel.skipped > 0 && (
          <span className="block">
            {funnel.skipped} lead{funnel.skipped === 1 ? "" : "s"} appear part-way
            through with no earlier stage — usually a gap in the sheet.
          </span>
        )}
        <span className="block">
          Counted in people, not rows. Each rate is measured only on the leads who
          reached the stage before it.{" "}
          <Link href={`/w/${slug}/leads`} className="text-brand hover:underline">
            Every lead →
          </Link>
        </span>
      </p>
    </div>
  );
}

/** Whole dollars — a threshold is set in dollars and reads as one. */
function dollars(amount: number): string {
  return `$${Math.round(amount / 100).toLocaleString("en-US")}`;
}

function TicketBand({
  label,
  count,
  amount,
  emphasis = false,
}: {
  label: string;
  count: number;
  amount: number;
  emphasis?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-faint text-[11px] tracking-wider uppercase">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span
          className={
            emphasis
              ? "text-xl font-semibold tabular-nums"
              : "text-xl font-medium tabular-nums"
          }
        >
          {count.toLocaleString("en-US")}
        </span>
        <span className="text-muted-foreground text-xs">
          {count === 1 ? "buyer" : "buyers"}
        </span>
        <Money
          amount={cents(amount)}
          className="text-muted-foreground ml-auto text-xs"
        />
      </p>
    </div>
  );
}
