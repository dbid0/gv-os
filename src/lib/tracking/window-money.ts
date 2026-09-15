/**
 * WINDOW MONEY — a workspace hero's headline, revenue, mix and curve for ONE
 * window, computed from ONE payment feed.
 *
 * The workspace "cash collected" number used to be summed from the client-layer
 * transactions ledger. Offers whose real payments live in a processor snapshot
 * (Stripe) or the tracking sheet have zero client-attributed ledger rows, so
 * that sum was always $0 for them — the headline read $0 (falling back to the
 * all-time figure) while the cash mix right beneath it, which reads the payment
 * snapshot, correctly showed the window's collected cash. Two surfaces, two
 * sources, one disagreement.
 *
 * The fix is this module: when a payment feed exists it IS the window money —
 * the collected cash equals the mix's own total (the SAME set the bar sums),
 * revenue is the window's contracted value from the feed's deals (never below
 * the cash already collected), and the curve is the feed's daily collected. The
 * ledger is the fallback ONLY for offers that have no payment feed at all
 * (ledger-native clients). Same precedence the cash mix already uses.
 *
 * Pure: no clock, no database. Money is integer cents throughout.
 */

import {
  cashMix,
  mixTotalCents,
  type CashMix,
  type MixPayment,
} from "@/lib/tracking/cash-mix";
import type { AliasMap } from "@/lib/tracking/aliases";
import { EMPTY_ALIASES } from "@/lib/tracking/aliases";
import { classifyPayment } from "@/lib/tracking/refunds";
import {
  HOME_RANGES,
  homeRangeHeadline,
  homeRangeSeries,
  previousBounds,
  rangeBounds,
  type HomeRow,
  type RangeBounds,
} from "@/lib/transactions/homepage";
import { dayEndIn, dayKeyIn, dayStartIn } from "@/lib/time/zone";

/** A deal row from a payment feed — its contracted value and when it landed. */
export interface FeedDeal {
  revenueCents: number | null;
  cashCents: number | null;
  occurredAt: Date | null;
}

/** Everything one offer's window money is computed from — one feed, one truth. */
export interface WindowMoneyFeed {
  /** Full payment history (dedupe + refund handling already applied upstream). */
  payments: MixPayment[];
  /** Deals for contracted-value; a processor-only feed carries none. */
  deals: FeedDeal[];
  aliases?: AliasMap;
}

export interface WindowMoney {
  /** Collected cash in the window — equals the mix total by construction. */
  cashCents: number;
  /** Contracted value in the window; never below cash collected. */
  revenueCents: number;
  mix: CashMix;
  /** Daily collected, ascending — the hero's growth curve. */
  series: { day: string; cents: number }[];
}

/** Contracted value from deals dated inside the window (revenue, else cash). */
export function dealsRevenueInWindow(deals: FeedDeal[], from: Date, to: Date): number {
  let sum = 0;
  for (const d of deals) {
    if (!d.occurredAt) continue;
    const t = d.occurredAt.getTime();
    if (t < from.getTime() || t > to.getTime()) continue;
    sum += d.revenueCents ?? d.cashCents ?? 0;
  }
  return sum;
}

/** Daily collected cash across the window, ascending — only days with money. */
function dailyCollectedSeries(
  payments: MixPayment[],
  from: Date,
  to: Date,
  timeZone: string,
): { day: string; cents: number }[] {
  const byDay = new Map<string, number>();
  for (const p of payments) {
    if (!p.occurredAt) continue;
    const t = p.occurredAt.getTime();
    if (t < from.getTime() || t > to.getTime()) continue;
    const cents = p.cashCents ?? 0;
    // Only collected money draws the curve — refunds/failed never do.
    if (cents <= 0) continue;
    if (classifyPayment({ cashCents: cents, status: p.status }) !== "collected") {
      continue;
    }
    const key = dayKeyIn(p.occurredAt, timeZone);
    byDay.set(key, (byDay.get(key) ?? 0) + cents);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, cents]) => ({ day, cents }));
}

/**
 * The full window money for one offer, from its payment feed. Collected cash is
 * the mix's own total; revenue is the window's contracted value floored at the
 * cash collected — so revenue can never read $0 (or below cash) under a
 * non-zero collected figure, and "still due" can never go negative.
 */
export function windowMoneyFromFeed(
  feed: WindowMoneyFeed,
  from: Date,
  to: Date,
  /** The calendar the daily series is drawn on — the viewer's zone. */
  timeZone = "UTC",
): WindowMoney {
  const mix = cashMix(feed.payments, from, to, feed.aliases ?? EMPTY_ALIASES);
  const cashCents = mixTotalCents(mix);
  const revenueCents = Math.max(dealsRevenueInWindow(feed.deals, from, to), cashCents);
  return {
    cashCents,
    revenueCents,
    mix,
    series: dailyCollectedSeries(feed.payments, from, to, timeZone),
  };
}

/** One (range × window) slice of a workspace hero, precomputed server-side. */
export interface WorkspaceMoneyVariant {
  key: string;
  label: string;
  from: string | null;
  to: string | null;
  cashCents: number;
  revenueCents: number;
  prevCashCents: number | null;
  prevRevenueCents: number | null;
  series: { day: string; cents: number }[];
  /** The cash mix for the window; null on the ledger-fallback path. */
  mix: CashMix | null;
}

/** A day-key window as real instants: local midnight to end of day in the zone. */
export const boundsToDates = (
  b: RangeBounds,
  todayKey: string,
  timeZone: string,
): { from: Date; to: Date } => ({
  from: b.from ? dayStartIn(b.from, timeZone) : new Date(0),
  to: dayEndIn(b.to ?? todayKey, timeZone),
});

type Slice = Pick<
  WorkspaceMoneyVariant,
  "cashCents" | "revenueCents" | "series" | "mix"
>;

function sliceFor(
  b: RangeBounds,
  todayKey: string,
  feed: WindowMoneyFeed | null,
  ledgerRows: HomeRow[],
  timeZone: string,
): Slice {
  // A payment feed wins — the same precedence the cash mix uses. The ledger is
  // the fallback ONLY when there is no feed at all (a ledger-native client).
  if (feed) {
    const { from, to } = boundsToDates(b, todayKey, timeZone);
    const wm = windowMoneyFromFeed(feed, from, to, timeZone);
    return {
      cashCents: wm.cashCents,
      revenueCents: wm.revenueCents,
      series: wm.series,
      mix: wm.mix,
    };
  }
  const h = homeRangeHeadline(ledgerRows, "all", b);
  return {
    cashCents: h.collectedCents,
    revenueCents: h.revenueCents,
    series: homeRangeSeries(ledgerRows, "all", b),
    mix: null,
  };
}

function variantFor(
  key: string,
  b: RangeBounds,
  todayKey: string,
  feed: WindowMoneyFeed | null,
  ledgerRows: HomeRow[],
  timeZone: string,
): WorkspaceMoneyVariant {
  const cur = sliceFor(b, todayKey, feed, ledgerRows, timeZone);
  const pb = previousBounds(b);
  const prev = pb ? sliceFor(pb, todayKey, feed, ledgerRows, timeZone) : null;
  return {
    key,
    label: b.label,
    from: b.from,
    to: b.to,
    cashCents: cur.cashCents,
    revenueCents: cur.revenueCents,
    prevCashCents: prev ? prev.cashCents : null,
    prevRevenueCents: prev ? prev.revenueCents : null,
    series: cur.series,
    mix: cur.mix,
  };
}

/**
 * Every preset window precomputed once (plus a dragged custom range, if any) —
 * so a workspace hero's range chips are pure client-side lookups instead of a
 * server round-trip per click. Cheap: each variant is a few sums over the same
 * in-memory payment feed (or ledger rows), never a query.
 */
export function buildWorkspaceVariants(
  feed: WindowMoneyFeed | null,
  ledgerRows: HomeRow[],
  todayKey: string,
  custom: RangeBounds | null,
  /** The viewer's zone: where each window's days start and end. */
  timeZone = "UTC",
): {
  variants: Record<string, WorkspaceMoneyVariant>;
  custom: WorkspaceMoneyVariant | null;
} {
  const variants: Record<string, WorkspaceMoneyVariant> = {};
  for (const r of HOME_RANGES) {
    variants[r] = variantFor(
      r,
      rangeBounds(r, todayKey),
      todayKey,
      feed,
      ledgerRows,
      timeZone,
    );
  }
  return {
    variants,
    custom: custom
      ? variantFor("custom", custom, todayKey, feed, ledgerRows, timeZone)
      : null,
  };
}
