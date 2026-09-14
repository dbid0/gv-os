"use client";

import { useState } from "react";

import { CollectedSparkline } from "@/components/shell/collected-sparkline";
import { CountUpMoney } from "@/components/shell/count-up-money";
import { CashMixBar } from "@/components/tracking/cash-mix-bar";
import { FeedFreshness } from "@/components/tracking/feed-freshness";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Money } from "@/components/ui/metric";
import { PeriodDelta } from "@/components/ui/period-delta";
import { RangeChips } from "@/components/ui/range-chips";
import { cents } from "@/lib/money";
import type { SnapshotFreshness } from "@/lib/tracking/freshness";
import { DEFAULT_HOME_RANGE, type HomeRange } from "@/lib/transactions/homepage";
import type { WorkspaceMoneyVariant } from "@/lib/tracking/window-money";

/**
 * The workspace hero — cash collected + revenue for the selected window, with
 * its curve and cash mix. Every preset window arrives precomputed in
 * `variants`, so the range chips are pure client-side lookups: the headline,
 * the revenue card, the mix bar, and the curve all move the instant a chip is
 * clicked, and the URL stays in sync without a navigation. This is the same
 * pattern the main dashboard hero uses (HomeHeadline). Only a dragged custom
 * calendar range still navigates — the server computes arbitrary bounds.
 *
 * The headline number IS the cash mix's own total (both are cut from the same
 * payment feed server-side), so the big figure can never disagree with the bar
 * beneath it. A window that genuinely collected nothing falls back to the
 * all-time figure with an explicit label rather than a bare $0.
 */
export function WorkspaceHero({
  slug,
  variants,
  custom,
  initialRange,
  todayKey,
  mixSource,
  moneyFreshness = null,
  allTimeCashCents,
}: {
  slug: string;
  variants: Record<string, WorkspaceMoneyVariant>;
  custom: WorkspaceMoneyVariant | null;
  initialRange: HomeRange | "custom";
  todayKey: string;
  mixSource: "stripe" | "sheet" | null;
  /** Age of the snapshot behind the headline; null on the ledger-native path. */
  moneyFreshness?: SnapshotFreshness | null;
  allTimeCashCents: number;
}) {
  const [range, setRange] = useState<HomeRange | "custom">(initialRange);

  const active =
    (range === "custom" ? custom : variants[range]) ??
    variants[DEFAULT_HOME_RANGE] ??
    Object.values(variants)[0];

  const pickRange = (r: HomeRange) => {
    setRange(r);
    const url = r === DEFAULT_HOME_RANGE ? `/w/${slug}` : `/w/${slug}?range=${r}`;
    window.history.replaceState(null, "", url);
  };

  const label = active.label;
  const showAllTimeFallback = active.cashCents === 0 && allTimeCashCents > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      {/* LEFT — Cash collected: the window's headline with its curve. */}
      <section className="card-grad elev-glow relative rounded-xl border">
        {/* The offer's growth curve behind the number — clipped in its OWN
            rounded layer, NOT on the section, so the date picker's dropdown
            can overflow the card instead of being chopped off. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
          <div className="absolute inset-x-0 bottom-0 h-2/3">
            <CollectedSparkline series={active.series} className="h-full w-full" />
          </div>
        </div>
        <div className="relative flex h-full flex-col justify-between gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            {/* One canonical story: never a bare $0.00 sitting above a non-zero
                figure — a quiet range falls back to the all-time number with an
                explicit label. */}
            {showAllTimeFallback ? (
              <div>
                <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
                  Cash collected — all time
                </p>
                <p className="numeric text-success text-4xl font-bold tracking-tight">
                  <CountUpMoney cents={allTimeCashCents} />
                </p>
                <p className="text-muted-foreground text-sm">
                  none in the {label.toLowerCase()}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
                  Cash collected — {label}
                </p>
                <p className="numeric text-success text-4xl font-bold tracking-tight">
                  <CountUpMoney cents={active.cashCents} />
                </p>
                <p className="text-muted-foreground text-sm">
                  collected
                  {active.revenueCents > active.cashCents && (
                    <>
                      {" "}
                      · <Money
                        amount={cents(active.revenueCents - active.cashCents)}
                      />{" "}
                      still due
                    </>
                  )}
                </p>
                <PeriodDelta
                  currentCents={active.cashCents}
                  previousCents={active.prevCashCents}
                />
              </div>
            )}
            <div className="flex flex-col items-end gap-1.5">
              <DateRangePicker
                basePath={`/w/${slug}`}
                activeRange={range}
                from={active.from}
                to={active.to}
                todayKey={todayKey}
              />
              {moneyFreshness && <FeedFreshness freshness={moneyFreshness} />}
            </div>
          </div>
          <RangeChips
            basePath={`/w/${slug}`}
            activeRange={range}
            onSelect={pickRange}
          />
        </div>
      </section>

      {/* RIGHT — Revenue generated: what was SOLD in the window, how it is
          coming in, and whose money it is. Unknown rows stay dashes. */}
      <section className="card-grad rounded-xl border p-5">
        <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
          Revenue generated — {label}
        </p>
        <p className="numeric text-foreground text-3xl font-bold tracking-tight">
          <CountUpMoney cents={active.revenueCents} />
        </p>
        <PeriodDelta
          currentCents={active.revenueCents}
          previousCents={active.prevRevenueCents}
        />
        <div className="text-muted-foreground mt-4 space-y-1.5 border-t pt-3 text-sm">
          <p className="flex items-center justify-between gap-3">
            <span>Cash collected</span>
            <span className="numeric text-foreground">
              <Money amount={cents(active.cashCents)} />
            </span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span>Cash left to collect</span>
            <span className="numeric text-foreground">
              {active.revenueCents > active.cashCents ? (
                <Money amount={cents(active.revenueCents - active.cashCents)} />
              ) : (
                "—"
              )}
            </span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span>Cash after fees</span>
            {/* Window rows don't carry processor fees yet — a dash, never an
                estimate. */}
            <span className="numeric">—</span>
          </p>
        </div>
        {active.mix && (
          <div className="mt-4 border-t pt-3">
            <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
              Cash mix
              {mixSource && (
                <span className="text-faint/80 normal-case">
                  {" "}
                  · {mixSource === "stripe" ? "via Stripe" : "from the tracking sheet"}
                </span>
              )}
            </p>
            <CashMixBar mix={active.mix} label={label} />
            {active.mix.unplaceableCents > 0 && (
              <p className="text-faint mt-1 text-[11px]">
                ${(active.mix.unplaceableCents / 100).toLocaleString("en-US")} without a
                payer identity — shown, not guessed
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
