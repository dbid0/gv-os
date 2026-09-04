import type { TrackingTab } from "@/lib/tracking/tabs";

/**
 * A LEAD'S JOURNEY THROUGH THE OFFER.
 *
 * The tracking sheet records the same person on several tabs — they apply, a
 * call gets booked, a closer files an end-of-call report, a deal is logged, a
 * payment lands, a balance sits in AR. Each tab answers one question. Nobody
 * can answer "what happened with this lead" without reading five of them.
 *
 * The join key is the EMAIL, because it is the only identifier every one of
 * those tabs carries. Names are typed by hand and appear as "lorenzo
 * saponara", "Lorenzo Saponara" and "lorenzo saponrara" in the same column;
 * joining on those would merge two people or split one.
 *
 * Rep-level tabs (BOD, the EODs) are deliberately excluded. They describe a
 * rep's day, carry no lead email, and folding them in would attach a setter's
 * dial count to whichever prospect sorted next to it.
 */

/** Tabs that describe a LEAD. The others describe a rep's day. */
export const LEAD_TABS: TrackingTab[] = [
  "applications",
  "calls",
  "eoc",
  "deals",
  "payments",
  "ar",
];

export function isLeadTab(tab: string): tab is TrackingTab {
  return (LEAD_TABS as string[]).includes(tab);
}

/** The order a lead moves through the offer, for sorting undated events. */
const STAGE_ORDER: Record<string, number> = {
  applications: 0,
  calls: 1,
  eoc: 2,
  deals: 3,
  payments: 4,
  ar: 5,
};

export interface LeadEventInput {
  tab: string;
  rowIndex: number;
  occurredAt: Date | null;
  email: string | null;
  name: string | null;
  rep: string | null;
  status: string | null;
  outcome: string | null;
  cashCents: number | null;
  revenueCents: number | null;
  recordingUrl: string | null;
  notes: string | null;
  payload: Record<string, string>;
}

export interface LeadEvent extends LeadEventInput {
  tab: TrackingTab;
  /** Where this event sits in the funnel, for a stable order without dates. */
  stage: number;
}

export interface LeadSummary {
  email: string;
  /** The longest name seen — hand-typed columns are often truncated. */
  name: string | null;
  /** Reps who touched this lead, in first-seen order. */
  reps: string[];
  firstSeen: Date | null;
  lastSeen: Date | null;
  applied: boolean;
  callsBooked: number;
  eocReports: number;
  /** EOC reports on this lead that carry a real recording link. */
  recordings: number;
  deals: number;
  /**
   * Cash from the PAYMENT LOG only — the processor's record of money taken.
   *
   * Deliberately not "all cash on the sheet": the same sale is restated on the
   * New Deals row and again by the closer on their EOC report, so adding them
   * up reports two or three times what came in. One definition, named for what
   * it sums. Still a TRACKING figure — the ledger is the only place a dollar
   * is truly recorded.
   */
  paymentsCents: number;
  /** The most recent status or outcome anyone wrote down. */
  latestStatus: string | null;
  events: LeadEvent[];
}

/**
 * Order a lead's events as a JOURNEY: funnel stage first, then time.
 *
 * Sorting purely by date is impossible here — undated rows are the norm, since
 * The Grid's Calls Log carries 7 dates across 109 rows. Sorting dated events
 * ahead of undated ones produced nonsense on screen: a lead's payment appeared
 * ABOVE the call that was booked to win it, because the payment had a date and
 * the booking didn't.
 *
 * Stage first fixes that and is also transitive, which a rule that switched
 * between comparing dates and comparing stages would not be — that kind of
 * comparator returns a different order depending on which pairs the sort
 * happens to test. Within one stage, real time orders the rows, and sheet row
 * order settles the rest.
 */
function orderEvents(events: LeadEvent[]): LeadEvent[] {
  return [...events].sort((a, b) => {
    if (a.stage !== b.stage) return a.stage - b.stage;
    if (a.occurredAt && b.occurredAt) {
      const diff = a.occurredAt.getTime() - b.occurredAt.getTime();
      if (diff !== 0) return diff;
    } else if (a.occurredAt || b.occurredAt) {
      return a.occurredAt ? -1 : 1;
    }
    return a.rowIndex - b.rowIndex;
  });
}

/** Group tracking rows into one summary per lead. */
export function buildLeadSummaries(rows: LeadEventInput[]): LeadSummary[] {
  const byEmail = new Map<string, LeadEvent[]>();

  for (const row of rows) {
    if (!row.email || !isLeadTab(row.tab)) continue;
    const event: LeadEvent = {
      ...row,
      tab: row.tab as TrackingTab,
      stage: STAGE_ORDER[row.tab] ?? 9,
    };
    const list = byEmail.get(row.email) ?? [];
    list.push(event);
    byEmail.set(row.email, list);
  }

  const out: LeadSummary[] = [];
  for (const [email, raw] of byEmail) {
    const events = orderEvents(raw);
    const dates = events
      .map((e) => e.occurredAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    const reps: string[] = [];
    for (const e of events) {
      const rep = e.rep?.trim();
      if (rep && !reps.some((r) => r.toLowerCase() === rep.toLowerCase())) {
        reps.push(rep);
      }
    }

    // The longest name wins: "Julian" and "Julian Schiederer" are the same
    // person typed twice, and the fuller one is the useful label.
    const name =
      events
        .map((e) => e.name?.trim())
        .filter((n): n is string => Boolean(n))
        .sort((a, b) => b.length - a.length)[0] ?? null;

    const latest = [...events].reverse().find((e) => e.status ?? e.outcome);

    out.push({
      email,
      name,
      reps,
      firstSeen: dates[0] ?? null,
      lastSeen: dates[dates.length - 1] ?? null,
      applied: events.some((e) => e.tab === "applications"),
      callsBooked: events.filter((e) => e.tab === "calls").length,
      eocReports: events.filter((e) => e.tab === "eoc").length,
      recordings: events.filter((e) => e.tab === "eoc" && e.recordingUrl).length,
      deals: events.filter((e) => e.tab === "deals").length,
      paymentsCents: events
        .filter((e) => e.tab === "payments")
        .reduce((sum, e) => sum + (e.cashCents ?? 0), 0),
      latestStatus: latest?.status ?? latest?.outcome ?? null,
      events,
    });
  }

  return out.sort((a, b) => {
    const at = a.lastSeen?.getTime() ?? 0;
    const bt = b.lastSeen?.getTime() ?? 0;
    if (at !== bt) return bt - at;
    return a.email.localeCompare(b.email);
  });
}

/** Leads matching a search over email, name and rep. */
export function searchLeads(leads: LeadSummary[], query: string): LeadSummary[] {
  const q = query.trim().toLowerCase();
  if (q === "") return leads;
  return leads.filter(
    (l) =>
      l.email.includes(q) ||
      (l.name?.toLowerCase().includes(q) ?? false) ||
      l.reps.some((r) => r.toLowerCase().includes(q)),
  );
}
