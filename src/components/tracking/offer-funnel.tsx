import Link from "next/link";

import { FunnelGraph } from "@/components/tracking/funnel-graph";
import { type OfferFunnel } from "@/lib/tracking/funnel";

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
  return (
    <div className="space-y-4">
      <FunnelGraph funnel={funnel} />

      <p className="text-faint text-xs">
        Counted in people, not rows — one lead with three end-of-call reports is one
        call held. Each rate is measured only on the leads who reached the stage before
        it.
        {funnel.paidWithoutDeal > 0 && (
          <>
            {" "}
            <span className="text-foreground font-medium">
              Two motions inside &ldquo;Paid&rdquo;:
            </span>{" "}
            {funnel.paidViaDeal} paid through the pipeline (a logged deal), and{" "}
            {funnel.paidWithoutDeal} paid with no deal row — $
            {(funnel.paidWithoutDealCents / 100).toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}{" "}
            net, mostly the low-ticket front end buying direct. More paid than closed is
            the OFFER&apos;s shape, not broken tracking.
          </>
        )}
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
