/**
 * WHEN the BOD went in — not just whether it did.
 *
 * Daniel: "it's good to be seen when the BODs are submitted. Tracking those
 * times." The brief already showed who hadn't filed; the standard the team is
 * actually held to is a TIME ("BOD before your first dial/DM"), so the brief
 * needs the clock, and a typical time to judge a day against.
 *
 * Pure and timezone-explicit: times are read in the business timezone (Central,
 * same as `dayKeyCT`), never the server's, so a submission never drifts across
 * an hour — or a day — because of where this runs.
 */

const CT = "America/Chicago";

/** One filed report, as the brief has it. */
export interface BodSubmission {
  repName: string | null;
  teamName: string | null;
  /** When the report was actually filed. */
  submittedAt: Date;
}

/** A filed BOD with its time worked out. */
export interface BodFiling extends BodSubmission {
  /** Minutes after midnight, Central. Sorts and averages without date maths. */
  minutes: number;
  /** "7:48 AM" — how the brief prints it. */
  label: string;
}

export interface BodTimeSummary {
  /** Everyone who filed, earliest first. */
  filed: BodFiling[];
  earliest: BodFiling | null;
  latest: BodFiling | null;
  /** The median filing time in minutes, or null when nobody filed. */
  medianMinutes: number | null;
  /** The median as a clock label — the day's "typical" BOD time. */
  medianLabel: string | null;
}

/** Minutes after midnight in the BUSINESS timezone, not the server's. */
export function minutesAfterMidnightCT(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CT,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  // hourCycle h23 renders midnight as 24 in some engines; fold it back to 0.
  return (get("hour") % 24) * 60 + get("minute");
}

/** "7:48 AM" in the business timezone. */
export function clockLabelCT(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CT,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Minutes-after-midnight → "7:48 AM", for a computed median with no Date. */
export function minutesToLabel(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${suffix}`;
}

/**
 * Shape the day's filings: sorted earliest-first, with the earliest, latest and
 * the MEDIAN time. Median rather than mean on purpose — one rep filing at
 * midnight should not drag the team's typical time across an hour.
 */
export function summarizeBodTimes(subs: BodSubmission[]): BodTimeSummary {
  const filed: BodFiling[] = subs
    .map((s) => ({
      ...s,
      minutes: minutesAfterMidnightCT(s.submittedAt),
      label: clockLabelCT(s.submittedAt),
    }))
    .sort((a, b) => a.minutes - b.minutes);

  if (filed.length === 0) {
    return {
      filed,
      earliest: null,
      latest: null,
      medianMinutes: null,
      medianLabel: null,
    };
  }

  const mid = Math.floor(filed.length / 2);
  const medianMinutes =
    filed.length % 2 === 1
      ? filed[mid].minutes
      : Math.round((filed[mid - 1].minutes + filed[mid].minutes) / 2);

  return {
    filed,
    earliest: filed[0],
    latest: filed[filed.length - 1],
    medianMinutes,
    medianLabel: minutesToLabel(medianMinutes),
  };
}
