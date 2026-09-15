/**
 * THE NUMBERS PAGE AS A SPREADSHEET — one row per figure.
 *
 * Columns: Section · Metric · Value · Unit · Measured over. Every row carries
 * the denominator the page prints under the tile, so a figure pasted into a
 * deck still says what it was measured against.
 *
 * Spreadsheet rules, deliberately different from the screen:
 * - Money is plain dollars ("1500.50"), no symbol or thousands separator, so a
 *   column sums without cleaning.
 * - Rates are plain numbers to two decimals (the screen rounds for reading).
 * - Unknown is an EMPTY cell, never 0 and never "—": a dash in a number column
 *   poisons the sum, and a zero would be a lie.
 *
 * Pure: no clock, no database.
 */

import type { OfferNumbers } from "@/lib/tracking/numbers-loader";

export const NUMBERS_CSV_HEADERS = [
  "Section",
  "Metric",
  "Value",
  "Unit",
  "Measured over",
];

export type CsvRow = [string, string, string, string, string];

const usd = (cents: number | null | undefined): string =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);

const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? "" : v.toFixed(2);

const num = (v: number | null | undefined): string =>
  v === null || v === undefined ? "" : String(v);

const of = (n: number, what: string) => `${n.toLocaleString("en-US")} ${what}`;

export function numbersCsvRows(n: OfferNumbers): CsvRow[] {
  const rows: CsvRow[] = [];
  const add = (
    section: string,
    metric: string,
    value: string,
    unit: string,
    over = "",
  ) => rows.push([section, metric, value, unit, over]);

  add("Window", "Label", n.bounds.label, "text");
  add("Window", "From", n.bounds.from ?? "", "date");
  add("Window", "To", n.bounds.to ?? "", "date");
  add(
    "Window",
    "Cut to",
    n.person ? `${n.person.name} (${n.person.by})` : "everyone",
    "text",
    n.person ? "calls and dialing only; cash and applications are the whole offer" : "",
  );

  const cash = n.cash.catalog;
  if (cash) {
    const src = n.cash.source === "stripe" ? "processor feed" : "sheet payment log";
    add("Cash", "Cash collected", usd(cash.cashCollectedCents), "USD", src);
    add("Cash", "Payments", num(cash.collectedCount), "count", src);
    add(
      "Cash",
      "Revenue generated",
      usd(cash.revenueGeneratedCents),
      "USD",
      "deals, floored at cash",
    );
    add(
      "Cash",
      "Cash left to collect",
      usd(cash.leftToCollectCents),
      "USD",
      "revenue − cash",
    );
    add("Cash", "People who paid", num(cash.payers), "count", "distinct payers");
    add("Cash", "Average order", usd(cash.aovCents), "USD", of(cash.payers, "payers"));
    add(
      "Cash",
      "Paid with no call first",
      usd(cash.noCallCents),
      "USD",
      "no booked call before paying",
    );
    add(
      "Cash",
      "Refunded",
      usd(cash.refundedCents),
      "USD",
      of(cash.refundedCount, "refunds"),
    );
    add("Cash", "Failed charges", num(cash.failedCount), "count", "");
    add(
      "Cash",
      "Hidden by tag rules",
      usd(cash.hidden.cents),
      "USD",
      of(cash.hidden.count, "payments"),
    );
    add("Cash", "Untagged cash", usd(cash.untaggedCents), "USD", "no rule matched");
    add(
      "Cash",
      "Cash after fees (estimate)",
      usd(cash.afterFeesEstimateCents),
      "USD",
      "offer's fee rate",
    );
    for (const t of cash.byTag) {
      add("Cash by tag", t.tag, usd(t.cents), "USD", of(t.count, "payments"));
    }
    for (const d of cash.byDay) add("Cash by day", d.day, usd(d.cents), "USD", "");
    cash.byHour.forEach((cents, hour) => {
      if (cents > 0)
        add(
          "Cash by hour",
          `${String(hour).padStart(2, "0")}:00`,
          usd(cents),
          "USD",
          "viewer's clock",
        );
    });
    if (cash.unplaceableHourCents > 0) {
      add(
        "Cash by hour",
        "No time of day",
        usd(cash.unplaceableHourCents),
        "USD",
        "date only",
      );
    }
  }

  const a = n.applications.numbers;
  if (a.source !== null) {
    const src = a.source === "form" ? "synced form" : "sheet Applications tab";
    add("Applications", "Applications", num(a.submitted), "count", src);
    add("Applications", "Applicants", num(a.people), "count", "distinct people");
    add(
      "Applications",
      "UTM-tagged",
      num(a.tagged),
      "count",
      a.tagged === null ? "sheet rows carry no UTMs" : of(a.submitted, "applications"),
    );
    add(
      "Applications",
      "Applied → booked",
      num(a.bookedPeople),
      "count",
      of(a.people, "applicants"),
    );
    add(
      "Applications",
      "Applied → booked rate",
      pct(a.bookRate),
      "%",
      of(a.people, "applicants"),
    );
    add(
      "Applications",
      "Booked with no application",
      num(a.bookedNoApplication),
      "count",
      "people with a call",
    );
    const s = a.speed;
    const dialled = n.applications.dialsConnected;
    add(
      "Speed to lead",
      "Median",
      dialled ? num(s.medianMinutes) : "",
      "minutes",
      of(s.matched, "dialled"),
    );
    add(
      "Speed to lead",
      `Within ${s.slaMinutes} minutes`,
      dialled ? pct(s.withinSlaPct) : "",
      "%",
      of(s.matched, "dialled"),
    );
    add(
      "Speed to lead",
      "Never dialled after applying",
      dialled ? num(s.neverDialled) : "",
      "count",
      of(s.dialable, "with an email or phone"),
    );
  }

  if (n.totalBookings > 0) {
    const c = n.calls;
    const answered = c.shows + c.noShows;
    add("Calls", "Booked", num(c.booked), "count", "bookings");
    add("Calls", "People booked", num(c.bookedPeople), "count", "distinct invitees");
    add("Calls", "Upcoming", num(c.upcoming), "count", "");
    add("Calls", "Needs an outcome", num(c.needsOutcome), "count", "");
    add("Calls", "Cancelled", num(c.cancelled), "count", of(c.booked, "booked"));
    add("Calls", "Cancelled rate", pct(c.rates.cancelled), "%", of(c.booked, "booked"));
    add(
      "Calls",
      "Rescheduled",
      num(c.rescheduled),
      "count",
      of(c.cancelled, "cancelled"),
    );
    add(
      "Confirmation",
      "Ever confirmed",
      num(c.everConfirmed),
      "count",
      of(c.booked, "booked"),
    );
    add(
      "Confirmation",
      "Ever confirmed rate",
      pct(c.rates.confirmed),
      "%",
      of(c.booked, "booked"),
    );
    add(
      "Confirmation",
      "Confirmed, no verdict yet",
      num(c.confirmedAwaiting),
      "count",
      "",
    );
    add(
      "Confirmation",
      "Confirmed then cancelled",
      num(c.confirmedThenCancelled),
      "count",
      of(c.everConfirmed, "confirmed"),
    );
    add(
      "Confirmation",
      "New calls",
      num(c.newCalls),
      "count",
      "never confirmed, no verdict",
    );
    add("Confirmation", "New, upcoming", num(c.newUpcoming), "count", "");
    add("Confirmation", "New, stuck", num(c.newStuck), "count", of(c.booked, "booked"));
    for (const seat of c.byConfirmer) {
      add("Confirmation by seat", `${seat.key} · calls`, num(seat.calls), "count", "");
      add("Confirmation by seat", `${seat.key} · held`, num(seat.held), "count", "");
      add(
        "Confirmation by seat",
        `${seat.key} · show rate`,
        pct(seat.showRate),
        "%",
        of(seat.shows + seat.noShows, "with a verdict"),
      );
      add(
        "Confirmation by seat",
        `${seat.key} · close rate`,
        pct(seat.closeRate),
        "%",
        of(seat.shows, "shows"),
      );
    }
    add("Verdicts", "Held", num(c.held), "count", "start passed, not cancelled");
    add(
      "Verdicts",
      "Shows",
      num(c.shows),
      "count",
      "closes + no-closes + disqualified",
    );
    add(
      "Verdicts",
      "Show rate",
      pct(c.rates.show),
      "%",
      of(answered, "with a verdict"),
    );
    add(
      "Verdicts",
      "No-shows",
      num(c.noShows),
      "count",
      of(answered, "with a verdict"),
    );
    add(
      "Verdicts",
      "No-show rate",
      pct(c.rates.noShow),
      "%",
      of(answered, "with a verdict"),
    );
    add("Verdicts", "Closes", num(c.closes), "count", of(c.shows, "shows"));
    add("Verdicts", "Close rate", pct(c.rates.close), "%", of(c.shows, "shows"));
    add("Verdicts", "No-closes", num(c.noCloses), "count", of(c.shows, "shows"));
    add("Verdicts", "Disqualified", num(c.disqualified), "count", of(c.shows, "shows"));
    add(
      "Verdicts",
      "Not held",
      num(c.notHeld),
      "count",
      "report says moved or called off",
    );
    add(
      "How closes paid",
      "Paid in full",
      num(c.closeKinds.pif),
      "count",
      of(c.closes, "closes"),
    );
    add(
      "How closes paid",
      "Split pay",
      num(c.closeKinds.split),
      "count",
      of(c.closes, "closes"),
    );
    add(
      "How closes paid",
      "Installments",
      num(c.closeKinds.installments),
      "count",
      of(c.closes, "closes"),
    );
    add(
      "How closes paid",
      "Deposit",
      num(c.closeKinds.deposit),
      "count",
      of(c.closes, "closes"),
    );
    add(
      "How closes paid",
      "Untyped",
      num(c.closeKinds.untyped),
      "count",
      of(c.closes, "closes"),
    );
    const reported = "reported on end-of-call forms, not processor cash";
    add(
      "Money on the calls",
      "Cash at the call",
      usd(c.cashAtCallCents),
      "USD",
      reported,
    );
    add(
      "Money on the calls",
      "Contract value",
      usd(c.revenueAtCallCents),
      "USD",
      reported,
    );
    add(
      "Money on the calls",
      "Still to collect",
      usd(c.leftToCollectCents),
      "USD",
      "contract − cash",
    );
    add(
      "Money on the calls",
      "Paid on a call",
      num(c.payersAtCall),
      "count",
      "distinct people",
    );
    add(
      "Money on the calls",
      "Average order",
      usd(c.aovAtCallCents),
      "USD",
      of(c.payersAtCall, "people who paid"),
    );
    add(
      "Money on the calls",
      "Cash per call taken",
      usd(c.cashPerCallCents),
      "USD",
      of(c.shows, "shows"),
    );
  }

  const d = n.dialing;
  if (d.connected || d.detail.total.dial.n > 0) {
    const t = d.detail.total;
    add("Dialing", "Dials", num(t.dial.n), "count", "outbound calls");
    add("Dialing", "Attempts", num(t.attempt.n), "count", "double-dials folded");
    add("Dialing", "People dialled", num(t.person.n), "count", "lead-days");
    add(
      "Dialing",
      "Pickup rate · dials",
      pct(t.dial.pickupRate),
      "%",
      of(t.dial.n, "dials"),
    );
    add(
      "Dialing",
      "Pickup rate · attempts",
      pct(t.attempt.pickupRate),
      "%",
      of(t.attempt.n, "attempts"),
    );
    add(
      "Dialing",
      "Reached · people",
      pct(t.person.pickupRate),
      "%",
      of(t.person.n, "lead-days"),
    );
    add(
      "Dialing",
      "Quality conversations",
      num(t.dial.quality),
      "count",
      of(t.dial.pickedUp, "pickups"),
    );
    add("Dialing", "No answer", num(t.dial.noAnswer), "count", of(t.dial.n, "dials"));
    add(
      "Dialing",
      "Talk time",
      num(Math.round(t.talkSeconds / 60)),
      "minutes",
      "all dials",
    );
    for (const r of d.detail.byRep) {
      add("Dialing by rep", `${r.rep} · dials`, num(r.dial.n), "count", "");
      add("Dialing by rep", `${r.rep} · attempts`, num(r.attempt.n), "count", "");
      add(
        "Dialing by rep",
        `${r.rep} · pickups`,
        num(r.dial.pickedUp),
        "count",
        of(r.dial.n, "dials"),
      );
      add(
        "Dialing by rep",
        `${r.rep} · pickup rate`,
        pct(r.dial.pickupRate),
        "%",
        of(r.dial.n, "dials"),
      );
      add(
        "Dialing by rep",
        `${r.rep} · talk time`,
        num(Math.round(r.talkSeconds / 60)),
        "minutes",
        "",
      );
    }
  }

  // The page prints these as footnotes. A spreadsheet outlives the page it came
  // from, so anything that makes a figure partial travels with it.
  if (n.applications.capped) {
    add(
      "Notes",
      "Applications capped",
      "",
      "note",
      "more rows than one page reads; the newest were counted",
    );
  }
  if (n.dialing.capped) {
    add(
      "Notes",
      "Dialing capped",
      "",
      "note",
      "more calls than one page reads; the newest were counted",
    );
  }
  if (a.undated > 0) {
    add(
      "Notes",
      "Undated applications",
      num(a.undated),
      "count",
      "no date; counted only under All time",
    );
  }
  if (d.detail.undated > 0) {
    add(
      "Notes",
      "Undated dials",
      num(d.detail.undated),
      "count",
      "no time; outside the per-person count",
    );
  }
  if (d.detail.total.unmeasured > 0) {
    add(
      "Notes",
      "Dials with no disposition",
      num(d.detail.total.unmeasured),
      "count",
      "count as dials only",
    );
  }

  return rows;
}

/** numbers-<offer>-<window>.csv, with no spaces or punctuation to escape. */
export function numbersCsvFilename(slug: string, rangeKey: string, todayKey: string) {
  return `numbers-${slug}-${rangeKey}-${todayKey}.csv`;
}
