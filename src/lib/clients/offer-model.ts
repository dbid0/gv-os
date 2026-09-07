import type { FunnelStageKey } from "@/lib/tracking/funnel";
import type { TrackingTab } from "@/lib/tracking/tabs";

/**
 * WHAT KIND OF OFFER THIS IS, AND THEREFORE WHAT IT TRACKS.
 *
 * GV does not run one shape of offer. The Grid is high-ticket: someone
 * applies, a call gets booked, a closer runs it and files an end-of-call
 * report, and a deal is logged. Base 44 is not that at all — a free course
 * into a low-ticket subscription, sold without a call ever happening. Tracking
 * for it runs through the new-sale forms and nothing else.
 *
 * Modelling that matters because the alternative is worse than untidy. An
 * offer with no calls, shown the call surfaces anyway, renders a funnel whose
 * middle is permanently zero, an EOC tab that never fills and a call-review
 * inbox that is empty forever. Every one of those reads as "the software is
 * broken" or "the floor did nothing", when the truth is that this offer does
 * not work that way.
 *
 * Pure: which tabs an offer uses and which funnel stages it has. No clock, no
 * database, so the shape of an offer is one decision in one place.
 */

export const OFFER_MODELS = ["high_ticket", "base44"] as const;
export type OfferModel = (typeof OFFER_MODELS)[number];

export const OFFER_MODEL_LABEL: Record<OfferModel, string> = {
  high_ticket: "High ticket — applications, calls, closers",
  base44: "Base 44 — sales only, no calls",
};

export const OFFER_MODEL_SHORT: Record<OfferModel, string> = {
  high_ticket: "High ticket",
  base44: "Base 44",
};

/** The default for an offer that has not said. High ticket is most of the book. */
export const DEFAULT_OFFER_MODEL: OfferModel = "high_ticket";

export function isOfferModel(value: string | null | undefined): value is OfferModel {
  return (OFFER_MODELS as readonly string[]).includes(value ?? "");
}

export function offerModelOf(value: string | null | undefined): OfferModel {
  return isOfferModel(value) ? value : DEFAULT_OFFER_MODEL;
}

/**
 * The tracking tabs an offer actually uses.
 *
 * Base 44 keeps applications (people still sign up) and the money tabs, and
 * drops everything built around a booked call. A tab absent here is not
 * "empty" on that offer — it does not apply, and the difference is worth
 * showing.
 */
const TABS: Record<OfferModel, TrackingTab[]> = {
  high_ticket: [
    "applications",
    "calls",
    "eoc",
    "deals",
    "payments",
    "ar",
    "bod",
    "setter_eod",
    "dm_setter_eod",
    "closer_eod",
  ],
  base44: ["applications", "deals", "payments", "ar"],
};

export function tabsForModel(model: OfferModel): TrackingTab[] {
  return TABS[model];
}

export function usesTab(model: OfferModel, tab: TrackingTab): boolean {
  return TABS[model].includes(tab);
}

/** Does this offer run calls at all? Gates the call surfaces wholesale. */
export function runsCalls(model: OfferModel): boolean {
  return model === "high_ticket";
}

/**
 * The funnel stages this offer has.
 *
 * A Base 44 buyer goes from signing up to paying. Showing "call booked" and
 * "call held" at zero between those two would report a 0% show rate on an
 * offer that never books a call.
 */
const STAGES: Record<OfferModel, FunnelStageKey[]> = {
  high_ticket: ["applied", "booked", "held", "closed", "paid"],
  base44: ["applied", "closed", "paid"],
};

export function stagesForModel(model: OfferModel): FunnelStageKey[] {
  return STAGES[model];
}
