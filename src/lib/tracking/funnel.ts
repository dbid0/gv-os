import type { LeadSummary } from "@/lib/tracking/leads";
import { ticketSplit, type TicketSplit } from "@/lib/tracking/ticket-split";

/**
 * THIS OFFER'S FUNNEL, COUNTED IN PEOPLE.
 *
 * Counted per LEAD, not per row: one prospect can have two end-of-call reports
 * and three payments, and a funnel that counted rows would show more calls held
 * than people who ever applied.
 *
 * A conversion is only ever measured on people who were actually at the earlier
 * stage. Dividing the number of leads who paid by the number who applied looks
 * like a funnel but isn't one — a client's Payment Log carries buyers who never
 * filled in an application (they came from a DM, a webinar, a referral), and
 * that arithmetic produces rates above 100% or silently overstates the offer.
 * So each rate is |leads at both stages| / |leads at the earlier stage|, and
 * the leads who skipped a stage are reported separately rather than hidden.
 */

export type FunnelStageKey = "applied" | "booked" | "held" | "closed" | "paid";

export interface FunnelStage {
  key: FunnelStageKey;
  label: string;
  /** Distinct leads that reached this stage. */
  leads: number;
}

export interface FunnelStep {
  from: FunnelStageKey;
  to: FunnelStageKey;
  label: string;
  /** Leads at BOTH stages. */
  advanced: number;
  /** Leads at the earlier stage — the only honest denominator. */
  eligible: number;
  /** advanced / eligible, or null when nobody was eligible. Never 0 for "unknown". */
  rate: number | null;
}

export interface OfferFunnel {
  stages: FunnelStage[];
  steps: FunnelStep[];
  /**
   * The two motions inside "paid". A high-ticket offer with a low-ticket
   * front end has buyers who never touch a closer: more people PAID than
   * ever had a deal logged, which reads as broken tracking unless the split
   * is named. Counted in people; money is the NET the lead summaries carry.
   */
  paidViaDeal: number;
  paidWithoutDeal: number;
  paidWithoutDealCents: number;
  /**
   * Leads who appear at a later stage without the earlier one — buyers who
   * never filled in an application, calls with no booking row. Reported, not
   * hidden: it is usually a gap in the sheet, occasionally a real other channel.
   */
  skipped: number;
  totalLeads: number;
  /**
   * The paid stage split at the offer's low-ticket line, counted in BUYERS.
   *
   * An offer selling a $49 subscription beside a $5,000 program has two
   * businesses inside one "Paid" bar, and undivided it reads as though
   * hundreds of people bought the thing the sales team sells. The line is the
   * offer's own (`ticketSplit`), so there is one definition of it across the
   * app and no price is written into code.
   *
   * Null when the offer has not set a line: an offer that sells one thing has
   * nothing to split, and a guessed line is worse than none because a wrong
   * split still looks like an answer.
   *
   * Each buyer is banded on their TOTAL payments, so someone who bought the
   * subscription and later the program counts once, as high ticket — which is
   * what they are.
   */
  buyers: TicketSplit | null;
}

const STAGE_LABELS: Record<FunnelStageKey, string> = {
  applied: "Applied",
  booked: "Call booked",
  held: "Call held",
  closed: "Deal logged",
  paid: "Paid",
};

const ORDER: FunnelStageKey[] = ["applied", "booked", "held", "closed", "paid"];

/** Which stages one lead reached. A filed EOC report IS the call being held. */
export function stagesFor(lead: LeadSummary): Set<FunnelStageKey> {
  const reached = new Set<FunnelStageKey>();
  if (lead.applied) reached.add("applied");
  if (lead.callsBooked > 0) reached.add("booked");
  if (lead.eocReports > 0) reached.add("held");
  if (lead.deals > 0) reached.add("closed");
  if (lead.paymentsCents > 0) reached.add("paid");
  return reached;
}

export function buildOfferFunnel(
  leads: LeadSummary[],
  /**
   * The stages THIS offer has. A Base 44 offer never books a call, so showing
   * "call booked" and "call held" at zero would report a 0% show rate on a
   * business that does not work that way.
   */
  stageKeys: FunnelStageKey[] = ORDER,
  /** The offer's low-ticket line. Unset = the paid stage is not split. */
  lowTicketCents?: number | null,
): OfferFunnel {
  const reached = leads.map(stagesFor);
  const ORDER_FOR_OFFER = ORDER.filter((k) => stageKeys.includes(k));

  const stages: FunnelStage[] = ORDER_FOR_OFFER.map((key) => ({
    key,
    label: STAGE_LABELS[key],
    leads: reached.filter((r) => r.has(key)).length,
  }));

  const steps: FunnelStep[] = [];
  for (let i = 0; i < ORDER_FOR_OFFER.length - 1; i += 1) {
    const from = ORDER_FOR_OFFER[i];
    const to = ORDER_FOR_OFFER[i + 1];
    const eligible = reached.filter((r) => r.has(from)).length;
    const advanced = reached.filter((r) => r.has(from) && r.has(to)).length;
    steps.push({
      from,
      to,
      label: `${STAGE_LABELS[from]} → ${STAGE_LABELS[to]}`,
      advanced,
      eligible,
      // Nobody eligible means the rate is UNKNOWN, not zero.
      rate: eligible === 0 ? null : advanced / eligible,
    });
  }

  // A lead who reached a stage without registering at every stage before it.
  // Their stages must form an unbroken run from the start: reaching "paid"
  // with no application means they entered the funnel partway, which is a gap
  // in the sheet or a channel the sheet doesn't record. A lead who simply
  // hasn't progressed yet (applied, booked, no further) is NOT a skip.
  const paidViaDeal = leads.filter((l) => l.paymentsCents > 0 && l.deals > 0).length;
  const paidWithoutDealLeads = leads.filter(
    (l) => l.paymentsCents > 0 && l.deals === 0,
  );

  const skipped = reached.filter((r) => {
    let highest = -1;
    ORDER_FOR_OFFER.forEach((s, i) => {
      if (r.has(s)) highest = i;
    });
    if (highest === -1) return false;
    return ORDER_FOR_OFFER.slice(0, highest + 1).some((s) => !r.has(s));
  }).length;

  return {
    stages,
    steps,
    paidViaDeal,
    paidWithoutDeal: paidWithoutDealLeads.length,
    paidWithoutDealCents: paidWithoutDealLeads.reduce(
      (sum, l) => sum + l.paymentsCents,
      0,
    ),
    skipped,
    totalLeads: leads.length,
    // One entry per paying LEAD, not per payment, so `count` is buyers.
    buyers: ticketSplit(
      leads
        .filter((l) => l.paymentsCents > 0)
        .map((l) => ({ cashCents: l.paymentsCents })),
      lowTicketCents,
    ),
  };
}

/** A rate as a percentage string, or "—" when it is unknown. */
export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}
