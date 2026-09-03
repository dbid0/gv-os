import type { LeadSummary } from "@/lib/tracking/leads";

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
   * Leads who appear at a later stage without the earlier one — buyers who
   * never filled in an application, calls with no booking row. Reported, not
   * hidden: it is usually a gap in the sheet, occasionally a real other channel.
   */
  skipped: number;
  totalLeads: number;
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

export function buildOfferFunnel(leads: LeadSummary[]): OfferFunnel {
  const reached = leads.map(stagesFor);

  const stages: FunnelStage[] = ORDER.map((key) => ({
    key,
    label: STAGE_LABELS[key],
    leads: reached.filter((r) => r.has(key)).length,
  }));

  const steps: FunnelStep[] = [];
  for (let i = 0; i < ORDER.length - 1; i += 1) {
    const from = ORDER[i];
    const to = ORDER[i + 1];
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
  const skipped = reached.filter((r) => {
    let highest = -1;
    ORDER.forEach((s, i) => {
      if (r.has(s)) highest = i;
    });
    if (highest === -1) return false;
    return ORDER.slice(0, highest + 1).some((s) => !r.has(s));
  }).length;

  return { stages, steps, skipped, totalLeads: leads.length };
}

/** A rate as a percentage string, or "—" when it is unknown. */
export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}
