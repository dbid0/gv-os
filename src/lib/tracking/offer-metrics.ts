/**
 * The offer metrics engine — ONE assembly for every number an offer surface
 * shows. The reference architecture: a single engine computes the full metric
 * object once, and every page, panel, and leaderboard is a re-cut of the same
 * result — so two surfaces can never disagree about the same offer.
 *
 * This module is the PURE half: it composes the already-tested pieces
 * (activity summaries, rep boards, closes-paid, stuck calls, confirmation
 * splits) into one typed object from primitives the caller fetched. It does
 * no I/O and reimplements no math — every number comes from the lib that
 * owns it. The I/O loader that feeds it lives beside the pages.
 *
 * Honesty rules carried through: unknown is null (never 0), every rate keeps
 * its denominator beside it, and empty inputs produce empty/null sections
 * rather than fabricated zeros.
 */

import {
  aggregateByRep,
  compareRepStats,
  summarizeActivity,
  type ActivityInput,
  type ActivityStats,
  type RepActivityStats,
} from "@/lib/sales/call-activity";
import { closesPaid, type ClosesPaid } from "@/lib/tracking/closes-paid";
import {
  cashMix,
  mixTotalCents,
  type CashMix,
  type MixPayment,
} from "@/lib/tracking/cash-mix";
import type { AliasMap } from "@/lib/tracking/aliases";
import {
  buildOfferFunnel,
  type FunnelStageKey,
  type OfferFunnel,
} from "@/lib/tracking/funnel";
import type { LeadSummary } from "@/lib/tracking/leads";
import { stuckCalls, type StuckCall, type StuckCandidate } from "@/lib/bookings/stuck";
import {
  splitByConfirmation,
  type ConfirmableCall,
  type ConfirmationRecord,
} from "@/lib/crm/confirmation";
import type { OfferStl } from "@/lib/crm/offer-stl";

/** The honest zero-state for speed to lead — no source, no numbers. */
export const DISCONNECTED_STL: OfferStl = {
  connected: false,
  medianMinutes: null,
  slaPct: null,
  measured: 0,
  applications: 0,
  everDialed: 0,
  byRep: [],
};

export type OfferMetricsInputs = {
  /** Applications submitted in the window (dates only — counts derive here). */
  appDates: Date[];
  /** This offer's logged call activity. */
  calls: ActivityInput[];
  /** Sheet/deal rows for the paid-mix strip; empty = strip stays null. */
  dealRows: {
    cashCents: number | null;
    revenueCents: number | null;
    label: string | null;
  }[];
  /** Synced bookings, for stuck calls and confirmation splits. */
  bookings: (StuckCandidate & { id: string })[];
  /** Emails with an end-of-call outcome on file (lowercased). */
  reportedEmails: Set<string>;
  /** Confirmation rows for this offer's bookings. */
  confirmations: ConfirmationRecord[];
  /** Speed-to-lead, already computed by its own engine. */
  stl: OfferStl;
  /** Lead-stitched funnel inputs; absent = the surface didn't load leads. */
  funnelLeads?: { leads: LeadSummary[]; stageKeys: FunnelStageKey[] } | null;
  /**
   * Windowed payments for the cash mix; absent = no processor/sheet feed. When
   * present, this feed ALSO owns the window money (headline + revenue): the
   * collected cash is the mix's own total, so the headline equals the mix by
   * construction. The window's contracted value and the previous window's
   * figures ride alongside, precomputed by the loader from the same feed.
   */
  mixWindow?: {
    payments: MixPayment[];
    from: Date;
    to: Date;
    aliases?: AliasMap;
    /** Contracted value sold in the window (feed deals); null = no deals feed. */
    windowRevenueCents?: number | null;
    /** Previous window's collected cash, for the "vs last period" delta. */
    prevCollectedCents?: number | null;
    /** Previous window's contracted value. */
    prevWindowRevenueCents?: number | null;
  } | null;
  /**
   * The window's client-layer money rows + the previous window's cash. The
   * LEDGER fallback — used only when there is no payment feed (mixWindow). A
   * feed always wins, so an empty ledger can never zero a headline the mix
   * shows as non-zero.
   */
  rangeMoney?: {
    rows: { cashCents: number; revenueCents: number }[];
    prevCash: number | null;
    prevRevenue: number | null;
  } | null;
};

export type RightNow = {
  /** Booked calls whose start is still ahead. */
  upcoming: number;
  /** Booked, start passed, no outcome on file (stuck.length, kept for cuts). */
  stuck: number;
  /** Booked, confirmed in time, start still ahead. */
  confirmedAwaiting: number;
};

export type ConfirmationMetrics = {
  /** Bookings ever confirmed before their start, of all bookings. */
  everConfirmed: number;
  ofBookings: number;
  /** Booked, confirmed in time, start still ahead — the good queue. */
  confirmedAwaiting: number;
  /** Confirmed in time and then cancelled anyway — the flake signal. */
  confirmedThenCancelled: number;
};

export type OfferMetrics = {
  apps: { count: number };
  activity: ActivityStats;
  /** Ranked rep board — the page total re-cut per rep, top N. */
  board: RepActivityStats[];
  /** How the closes paid; null when there are no deal rows to classify. */
  paidMix: ClosesPaid | null;
  stuck: StuckCall[];
  /** The offer's funnel; null until leads exist for the surface. */
  funnel: OfferFunnel | null;
  /** Whose money the window is made of; null without a payment feed. */
  cashMix: CashMix | null;
  /** Window money; null when the surface didn't ask for range rows. */
  money: {
    rangeCash: number;
    rangeRevenue: number;
    prevRangeCash: number | null;
    prevRangeRevenue: number | null;
  } | null;
  rightNow: RightNow;
  confirmation: ConfirmationMetrics;
  stl: OfferStl;
};

export const BOARD_LIMIT = 8;

export function assembleOfferMetrics(
  inputs: OfferMetricsInputs,
  now: Date,
): OfferMetrics {
  const confirmable: ConfirmableCall[] = inputs.bookings.map((b) => ({
    id: b.id,
    startsAt: b.startsAt,
    status: b.status,
  }));
  const split = splitByConfirmation(confirmable, inputs.confirmations, now);
  const upcoming = inputs.bookings.filter(
    (b) => b.status === "booked" && b.startsAt && b.startsAt.getTime() > now.getTime(),
  ).length;
  const stuck = stuckCalls(inputs.bookings, inputs.reportedEmails, now);

  // The window's cash mix — and, when a feed is present, the window money is a
  // cut of this SAME mix, so the headline can never disagree with the bar.
  const mix = inputs.mixWindow
    ? cashMix(
        inputs.mixWindow.payments,
        inputs.mixWindow.from,
        inputs.mixWindow.to,
        inputs.mixWindow.aliases,
      )
    : null;

  return {
    apps: { count: inputs.appDates.length },
    activity: summarizeActivity(inputs.calls),
    board: aggregateByRep(inputs.calls).sort(compareRepStats).slice(0, BOARD_LIMIT),
    paidMix: inputs.dealRows.length > 0 ? closesPaid(inputs.dealRows) : null,
    stuck,
    funnel: inputs.funnelLeads
      ? buildOfferFunnel(inputs.funnelLeads.leads, inputs.funnelLeads.stageKeys)
      : null,
    cashMix: mix,
    money: buildWindowMoney(mix, inputs.mixWindow, inputs.rangeMoney),
    rightNow: {
      upcoming,
      stuck: stuck.length,
      confirmedAwaiting: split.confirmedAwaiting,
    },
    confirmation: {
      everConfirmed: split.confirmed.length,
      ofBookings: inputs.bookings.length,
      confirmedAwaiting: split.confirmedAwaiting,
      confirmedThenCancelled: split.confirmedThenCancelled,
    },
    stl: inputs.stl,
  };
}

/**
 * The window's headline money. Precedence matches the cash mix: a payment feed
 * (Stripe, else the sheet) WINS — its collected cash is the mix's own total, so
 * the "cash collected" headline equals the mix beneath it by construction, and
 * revenue is the window's contracted value floored at that cash (never a false
 * $0, never below what was collected). The client-layer ledger is the fallback
 * ONLY when there is no feed at all (a ledger-native client); an empty ledger
 * can no longer zero a headline the mix shows as non-zero. Null when neither
 * source was loaded.
 */
function buildWindowMoney(
  mix: CashMix | null,
  mixWindow: OfferMetricsInputs["mixWindow"],
  rangeMoney: OfferMetricsInputs["rangeMoney"],
): OfferMetrics["money"] {
  if (mix && mixWindow) {
    const rangeCash = mixTotalCents(mix);
    const rangeRevenue = Math.max(mixWindow.windowRevenueCents ?? 0, rangeCash);
    const prevRangeCash = mixWindow.prevCollectedCents ?? null;
    const prevRangeRevenue =
      prevRangeCash === null
        ? null
        : Math.max(mixWindow.prevWindowRevenueCents ?? 0, prevRangeCash);
    return { rangeCash, rangeRevenue, prevRangeCash, prevRangeRevenue };
  }
  if (rangeMoney) {
    return {
      rangeCash: rangeMoney.rows.reduce((s, r) => s + r.cashCents, 0),
      rangeRevenue: rangeMoney.rows.reduce((s, r) => s + r.revenueCents, 0),
      prevRangeCash: rangeMoney.prevCash,
      prevRangeRevenue: rangeMoney.prevRevenue,
    };
  }
  return null;
}
