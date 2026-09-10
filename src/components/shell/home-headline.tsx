"use client";

import Link from "next/link";
import { useState } from "react";

import { setHomeMode } from "@/app/(app)/dashboard/actions";
import { AmbientBackdrop } from "@/components/shell/ambient-backdrop";
import { CollectedSparkline } from "@/components/shell/collected-sparkline";
import { PeriodDelta } from "@/components/ui/period-delta";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { RangeChips } from "@/components/ui/range-chips";
import { setHomeScopeKey, useCountUp } from "@/lib/client-state";
import {
  DEFAULT_HOME_RANGE,
  HOME_MODES,
  type HomeMode,
  type HomeRange,
} from "@/lib/transactions/homepage";
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

/** Everything one (range × mode) window needs — precomputed server-side. */
export interface HomeVariant {
  label: string;
  from: string | null;
  to: string | null;
  collectedCents: number;
  revenueCents: number;
  previousCollectedCents: number | null;
  previousRevenueCents: number | null;
  series: { day: string; cents: number }[];
  sections: HomeSection[];
}

/**
 * The dashboard hero. Every preset window × scope pair arrives precomputed in
 * `variants`, so the toggles are pure lookups: the highlight, the numbers,
 * the curve, and the cards all move the instant they're clicked. The old
 * wiring round-tripped every click through a server action plus a full RSC
 * refresh — half a second of disabled buttons to change which slice of 41
 * rows was summed. The server still learns about mode changes (the pref
 * persists for next visit) but nothing waits on it. Only a dragged custom
 * calendar range still navigates: the server computes arbitrary bounds.
 */
export function HomeHeadline({
  variants,
  initialMode,
  initialRange,
  custom,
  todayKey,
}: {
  variants: Record<string, HomeVariant>;
  initialMode: HomeMode;
  initialRange: HomeRange | "custom";
  /** The active variant when the URL carries a dragged custom range. */
  custom: HomeVariant | null;
  todayKey: string;
}) {
  const [mode, setMode] = useState<HomeMode>(initialMode);
  const [range, setRange] = useState<HomeRange | "custom">(initialRange);

  const active = range === "custom" && custom ? custom : variants[`${range}|${mode}`];

  const syncUrl = (r: HomeRange) => {
    const url = r === DEFAULT_HOME_RANGE ? "/dashboard" : `/dashboard?range=${r}`;
    window.history.replaceState(null, "", url);
  };

  const pickMode = (m: HomeMode) => {
    setMode(m);
    const r = range === "custom" ? DEFAULT_HOME_RANGE : range;
    if (range === "custom") {
      setRange(r);
      syncUrl(r);
    }
    setHomeScopeKey(`${r}|${m}`);
    // Persist the preference for the next visit — nothing waits on it.
    void setHomeMode(m).catch(() => {});
  };

  const pickRange = (r: HomeRange) => {
    setRange(r);
    syncUrl(r);
    setHomeScopeKey(`${r}|${mode}`);
  };

  // The hero numbers ease between figures — quick enough to feel like the
  // toggle itself, never like a fetch.
  const shownCollected = useCountUp(active.collectedCents, 450);
  const shownRevenue = useCountUp(active.revenueCents, 450);

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
              <CollectedSparkline series={active.series} className="h-full w-full" />
            </div>
          </div>

          <div className="relative flex h-full flex-col justify-between gap-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-faint flex items-center gap-2 text-[11px] font-medium tracking-wider uppercase">
                  <span className="dot-brand inline-block size-1.5 rounded-full" />
                  Cash collected — {active.label}
                </p>
                <div className="mt-2">
                  <p className="numeric text-success text-5xl font-bold tracking-tight tabular-nums">
                    {fmtUsd(shownCollected)}
                  </p>
                  <PeriodDelta
                    currentCents={active.collectedCents}
                    previousCents={active.previousCollectedCents}
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
                      onClick={() => pickMode(m)}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs transition-colors",
                        m === mode
                          ? "bg-brand-soft/70 text-foreground border-brand/40 border font-medium"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {MODE_LABELS[m]}
                    </button>
                  ))}
                </div>
                <DateRangePicker
                  basePath="/dashboard"
                  activeRange={range}
                  from={active.from}
                  to={active.to}
                  todayKey={todayKey}
                />
              </div>
            </div>

            <RangeChips
              basePath="/dashboard"
              activeRange={range}
              onSelect={pickRange}
            />
          </div>
        </section>

        {/* RIGHT — Total revenue: what was sold, and how much of it arrived. */}
        <section className="card-grad rounded-xl border p-6">
          <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
            Total revenue — {active.label}
          </p>
          <div className="mt-2">
            <p className="numeric text-3xl font-bold tracking-tight tabular-nums">
              {fmtUsd(shownRevenue)}
            </p>
            <PeriodDelta
              currentCents={active.revenueCents}
              previousCents={active.previousRevenueCents}
            />
          </div>
          <div className="text-muted-foreground mt-4 space-y-1.5 border-t pt-3 text-sm">
            <p className="flex items-center justify-between gap-3">
              <span>Cash collected</span>
              <span className="numeric text-foreground">
                {fmtUsd(active.collectedCents)}
              </span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span>Still due</span>
              <span
                className={cn(
                  "numeric",
                  active.revenueCents > active.collectedCents
                    ? "text-warning"
                    : "text-foreground",
                )}
              >
                {active.revenueCents > active.collectedCents
                  ? fmtUsd(active.revenueCents - active.collectedCents)
                  : "—"}
              </span>
            </p>
          </div>
        </section>
      </div>

      {/* Whose money the window is made of — one card per source of cash,
          never a mixed layer. Out of the hero so the curve stays legible. */}
      {active.sections.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {active.sections.map((s) => (
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
