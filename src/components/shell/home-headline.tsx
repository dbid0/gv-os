"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";

import { setHomeMode } from "@/app/(app)/dashboard/actions";
import { AmbientBackdrop } from "@/components/shell/ambient-backdrop";
import { CollectedSparkline } from "@/components/shell/collected-sparkline";
import { PeriodDelta } from "@/components/ui/period-delta";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { RangeChips } from "@/components/ui/range-chips";
import { useToast } from "@/components/ui/toast";
import { useCountUp } from "@/lib/client-state";
import { HOME_MODES, type HomeMode, type HomeRange } from "@/lib/transactions/homepage";
import { cn } from "@/lib/utils";

const fmtUsd = (c: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(c / 100);

const MODE_LABELS: Record<HomeMode, string> = {
  all: "All",
  agency: "Agency",
  clients: "Clients",
};

export interface HomeSection {
  /** The client's own colour, resolved server-side from the DB roster. */
  accent?: string;
  slug: string | null;
  name: string;
  cashCents: number;
  revenueCents: number;
}

export function HomeHeadline({
  mode,
  range,
  from,
  to,
  todayKey,
  monthLabel,
  collectedCents,
  previousCollectedCents = null,
  revenueCents,
  previousRevenueCents = null,
  sections,
  series,
}: {
  mode: HomeMode;
  range: HomeRange | "custom";
  from: string | null;
  to: string | null;
  todayKey: string;
  monthLabel: string;
  collectedCents: number;
  previousCollectedCents?: number | null;
  revenueCents: number;
  previousRevenueCents?: number | null;
  sections: HomeSection[];
  series: { day: string; cents: number }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { toast } = useToast();
  // Optimistic scope: the highlight jumps on click; the numbers catch up when
  // the server responds, so the toggle never feels like it's hanging.
  const [optimisticMode, setOptimisticMode] = useState(mode);
  const activeMode = pending ? optimisticMode : mode;

  // The hero numbers count up — the money "landing" on load and easing to the
  // new figure on a scope toggle.
  const shownCollected = useCountUp(collectedCents);
  const shownRevenue = useCountUp(revenueCents);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* LEFT — Cash collected: the agency's headline with its curve. */}
        <section className="card-grad elev-glow relative rounded-xl border">
          {/* Decoration lives in its OWN clipped layer, matched to the card's
              rounded shape — the section itself is NOT clipped, so the date
              picker's dropdown can overflow the card. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
          >
            <AmbientBackdrop />
            <div
              className="absolute -top-24 -right-16 h-64 w-64 rounded-full opacity-60 blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in oklab, var(--brand) 22%, transparent), transparent 70%)",
              }}
            />
            <div className="absolute inset-x-0 bottom-0 h-2/3">
              <CollectedSparkline series={series} className="h-full w-full" />
            </div>
          </div>

          <div className="relative flex h-full flex-col justify-between gap-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-faint flex items-center gap-2 text-[11px] font-medium tracking-wider uppercase">
                  <span className="dot-brand inline-block size-1.5 rounded-full" />
                  Cash collected — {monthLabel}
                </p>
                {/* Dimmed while a mode switch is in flight: these are still
                    the OLD mode's figures. */}
                <div
                  className={cn(
                    "mt-2 transition-opacity duration-200",
                    pending && "opacity-40",
                  )}
                >
                  <p className="numeric text-success text-5xl font-bold tracking-tight tabular-nums">
                    {fmtUsd(shownCollected)}
                  </p>
                  <PeriodDelta
                    currentCents={collectedCents}
                    previousCents={previousCollectedCents}
                  />
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div
                  className="flex gap-1 rounded-lg border p-1"
                  role="group"
                  aria-label="Scope"
                >
                  {HOME_MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setOptimisticMode(m);
                        start(async () => {
                          try {
                            await setHomeMode(m);
                            router.refresh();
                          } catch (e) {
                            setOptimisticMode(mode);
                            toast({
                              tone: "error",
                              title: e instanceof Error ? e.message : "Action failed.",
                            });
                          }
                        });
                      }}
                      className={cn(
                        "relative rounded-md px-3 py-1 text-xs transition-colors",
                        m === activeMode
                          ? "bg-brand-soft/70 text-foreground border-brand/40 border font-medium"
                          : "text-muted-foreground hover:text-foreground",
                        pending && "cursor-wait",
                      )}
                    >
                      {MODE_LABELS[m]}
                      {pending && m === activeMode && (
                        <Loader2 className="text-brand absolute top-1/2 -right-1 size-3 -translate-y-1/2 animate-spin" />
                      )}
                    </button>
                  ))}
                </div>
                <DateRangePicker
                  basePath="/dashboard"
                  activeRange={range}
                  from={from}
                  to={to}
                  todayKey={todayKey}
                />
              </div>
            </div>

            <RangeChips basePath="/dashboard" activeRange={range} />
          </div>
        </section>

        {/* RIGHT — Total revenue: what was sold, and how much of it arrived. */}
        <section className="card-grad rounded-xl border p-6">
          <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
            Total revenue — {monthLabel}
          </p>
          <div
            className={cn(
              "mt-2 transition-opacity duration-200",
              pending && "opacity-40",
            )}
          >
            <p className="numeric text-3xl font-bold tracking-tight tabular-nums">
              {fmtUsd(shownRevenue)}
            </p>
            <PeriodDelta
              currentCents={revenueCents}
              previousCents={previousRevenueCents}
            />
          </div>
          <div className="text-muted-foreground mt-4 space-y-1.5 border-t pt-3 text-sm">
            <p className="flex items-center justify-between gap-3">
              <span>Cash collected</span>
              <span className="numeric text-foreground">{fmtUsd(collectedCents)}</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span>Still due</span>
              <span
                className={cn(
                  "numeric",
                  revenueCents > collectedCents ? "text-warning" : "text-foreground",
                )}
              >
                {revenueCents > collectedCents
                  ? fmtUsd(revenueCents - collectedCents)
                  : "—"}
              </span>
            </p>
          </div>
        </section>
      </div>

      {/* Whose money the window is made of — one card per source of cash,
          never a mixed layer. Out of the hero so the curve stays legible. */}
      {sections.length > 0 && (
        <div
          className={cn(
            "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
            pending && "opacity-40",
          )}
        >
          {sections.map((s) => (
            <Link
              key={s.slug ?? s.name}
              href={s.slug ? `/w/${s.slug}` : "/accounting/transactions"}
              className="bg-card hover-lift hover:border-brand/40 rounded-lg border p-3"
            >
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    background: s.accent || "var(--brand)",
                  }}
                />
                {s.name}
              </p>
              <p className="numeric mt-0.5 text-lg font-semibold tabular-nums">
                {fmtUsd(s.cashCents)}
              </p>
              {s.revenueCents > s.cashCents && (
                <p className="text-faint text-[11px]">
                  {fmtUsd(s.revenueCents - s.cashCents)} still due
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
