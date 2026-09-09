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
import { cashMix, type CashMix, type MixPayment } from "@/lib/tracking/cash-mix";
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
  /** Windowed payments for the cash mix; absent = no processor/sheet feed. */
  mixWindow?: { payments: MixPayment[]; from: Date; to: Date } | null;
  /** The window's client-layer money rows + the previous window's cash. */
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

  return {
    apps: { count: inputs.appDates.length },
    activity: summarizeActivity(inputs.calls),
    board: aggregateByRep(inputs.calls).sort(compareRepStats).slice(0, BOARD_LIMIT),
    paidMix: inputs.dealRows.length > 0 ? closesPaid(inputs.dealRows) : null,
    stuck,
    funnel: inputs.funnelLeads
      ? buildOfferFunnel(inputs.funnelLeads.leads, inputs.funnelLeads.stageKeys)
      : null,
    cashMix: inputs.mixWindow
      ? cashMix(inputs.mixWindow.payments, inputs.mixWindow.from, inputs.mixWindow.to)
      : null,
    money: inputs.rangeMoney
      ? {
          rangeCash: inputs.rangeMoney.rows.reduce((s, r) => s + r.cashCents, 0),
          rangeRevenue: inputs.rangeMoney.rows.reduce((s, r) => s + r.revenueCents, 0),
          prevRangeCash: inputs.rangeMoney.prevCash,
          prevRangeRevenue: inputs.rangeMoney.prevRevenue,
        }
      : null,
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
