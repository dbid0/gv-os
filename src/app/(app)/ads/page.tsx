import Link from "next/link";
import { Megaphone } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { Kpi, Money } from "@/components/ui/metric";
import { getAdsData } from "@/lib/ads/ads-data";
import { cents } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata = { title: "Ads - GV OS" };
export const dynamic = "force-dynamic";

const roasTone = (roas: number) =>
  roas >= 3 ? "text-success" : roas >= 1 ? "text-foreground" : "text-destructive";

const dash = <span className="text-faint">—</span>;

export default async function AdsPage() {
  const { rows, totals } = await getAdsData();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Ad"
        highlight="efficiency."
        description="What the spend bought, per offer — lifetime ad spend against the cash it collected, with cost per deal and per application. Spend is entered on each offer's page."
        status={
          <StatusPill tone={rows.length ? "live" : "muted"}>
            {rows.length} {rows.length === 1 ? "offer" : "offers"}
          </StatusPill>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Ad spend (lifetime)"
          value={<Money amount={cents(totals.spendCents)} />}
          tone="brand"
        />
        <Kpi
          label="Cash from those offers"
          value={<Money amount={cents(totals.cashCents)} />}
          tone="success"
        />
        <Kpi
          label="Blended ROAS"
          value={totals.spendCents > 0 ? `${totals.roas.roas}x` : "—"}
        />
        <Kpi
          label="Return after spend"
          value={<Money amount={cents(totals.roas.profitCents)} />}
          tone={totals.roas.profitCents >= 0 ? "success" : "danger"}
        />
      </div>

      {rows.length === 0 ? (
        <Panel title="No ad spend recorded yet">
          <p className="text-faint py-8 text-center text-sm">
            <Megaphone className="mr-1 inline size-4" />
            Add spend on an offer&apos;s page (Manage → Data feeds → Ad spend) and its
            ROAS, cost per deal, and cost per application land here.
          </p>
        </Panel>
      ) : (
        <Panel title="By offer" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-faint border-b text-left text-[11px] tracking-wider uppercase">
                  <th className="px-4 py-2.5 font-medium">Offer</th>
                  <th className="px-4 py-2.5 text-right font-medium">Spend</th>
                  <th className="px-4 py-2.5 text-right font-medium">Spend · mo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cash</th>
                  <th className="px-4 py-2.5 text-right font-medium">ROAS</th>
                  <th className="px-4 py-2.5 text-right font-medium">CAC / deal</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cost / app</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.slug}
                    className="hover:bg-secondary/40 border-b transition-colors last:border-0"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Link
                        href={`/clients/${r.slug}`}
                        className="hover:text-brand inline-flex items-center gap-2 font-medium transition-colors"
                      >
                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: r.accent }}
                        />
                        {r.name}
                      </Link>
                    </td>
                    <td className="numeric px-4 py-2.5 text-right">
                      <Money amount={cents(r.spendTotalCents)} />
                    </td>
                    <td className="numeric text-muted-foreground px-4 py-2.5 text-right">
                      <Money amount={cents(r.spendMonthCents)} />
                    </td>
                    <td className="numeric px-4 py-2.5 text-right">
                      <Money amount={cents(r.cashCents)} />
                    </td>
                    <td
                      className={cn(
                        "numeric px-4 py-2.5 text-right font-semibold",
                        roasTone(r.roas.roas),
                      )}
                    >
                      {r.roas.roas}x
                    </td>
                    <td className="numeric text-muted-foreground px-4 py-2.5 text-right">
                      {r.roas.cacPerDealCents === null ? (
                        dash
                      ) : (
                        <Money amount={cents(r.roas.cacPerDealCents)} />
                      )}
                    </td>
                    <td className="numeric text-muted-foreground px-4 py-2.5 text-right">
                      {r.roas.cacPerAppCents === null ? (
                        dash
                      ) : (
                        <Money amount={cents(r.roas.cacPerAppCents)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <p className="text-faint text-xs">
        ROAS is cash collected ÷ lifetime spend. Offers whose rev-share deducts ad spend
        already net it out before GV&apos;s cut on the Rev-share page.
      </p>
    </div>
  );
}
