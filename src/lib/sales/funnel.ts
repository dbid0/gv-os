/**
 * The sales funnel — set → show → close, per rep and for the team. Pure and
 * tested; the manager cockpit reads it. Every rate divides safely: a zero
 * denominator yields null (rendered as an em dash), never NaN or a fake 0% —
 * "no shows yet" is not the claim "0% close rate".
 */

export interface RepFunnelInput {
  repId: string;
  name: string;
  teamName: string | null;
  setsBooked: number;
  shows: number;
  deals: number;
}

export interface RepFunnelRow extends RepFunnelInput {
  /** shows ÷ sets booked. */
  showRatePct: number | null;
  /** deals ÷ shows. */
  closeRatePct: number | null;
  /** deals ÷ sets booked — the whole-funnel conversion. */
  setToCloseRatePct: number | null;
}

export interface FunnelSummary {
  setsBooked: number;
  shows: number;
  deals: number;
  showRatePct: number | null;
  closeRatePct: number | null;
  setToCloseRatePct: number | null;
  /** Reps ranked by deals, then shows. */
  reps: RepFunnelRow[];
}

/** n ÷ d as a whole percent, or null when there is no denominator. */
export function ratePct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

function rowFor(i: RepFunnelInput): RepFunnelRow {
  return {
    ...i,
    showRatePct: ratePct(i.shows, i.setsBooked),
    closeRatePct: ratePct(i.deals, i.shows),
    setToCloseRatePct: ratePct(i.deals, i.setsBooked),
  };
}

export function computeFunnel(inputs: RepFunnelInput[]): FunnelSummary {
  const setsBooked = inputs.reduce((s, r) => s + r.setsBooked, 0);
  const shows = inputs.reduce((s, r) => s + r.shows, 0);
  const deals = inputs.reduce((s, r) => s + r.deals, 0);

  const reps = inputs
    .map(rowFor)
    .filter((r) => r.setsBooked > 0 || r.shows > 0 || r.deals > 0)
    .sort((a, b) => b.deals - a.deals || b.shows - a.shows);

  return {
    setsBooked,
    shows,
    deals,
    showRatePct: ratePct(shows, setsBooked),
    closeRatePct: ratePct(deals, shows),
    setToCloseRatePct: ratePct(deals, setsBooked),
    reps,
  };
}
