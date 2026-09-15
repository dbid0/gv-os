/**
 * DIALING DETAIL — what the dialler actually recorded, at three grains.
 *
 * The reference product reads a floor's dialling three ways, because each
 * answers a different question:
 *
 * - per DIAL      every outbound call row Close recorded
 * - per ATTEMPT   dials by the same rep to the same person with no more than
 *                 two minutes between them are one attempt (the double-dial)
 * - per PERSON    distinct (day, person) pairs: did we reach this lead today?
 *
 * At each grain it counts pickups, no-answers and quality conversations:
 *
 * - A dial is PICKED UP when Close's disposition says answered; with no
 *   disposition, when it lasted at least PICKUP_SECONDS.
 * - A dial is a NO-ANSWER when the disposition says no answer, busy,
 *   voicemail, blocked or failed; with no disposition, when it recorded zero
 *   seconds.
 * - A dial is a QUALITY CONVERSATION when it was picked up and lasted at least
 *   QUALITY_SECONDS.
 * - Anything else (a short call with no disposition, an unknown length) is
 *   UNMEASURED: counted as a dial, never guessed into either bucket.
 *
 * An attempt or a person-day is picked up / a quality conversation when ANY of
 * its dials is; a no-answer when every dial is. Inbound calls are not dials.
 * Per-rep rows re-cut the same dials: dials, attempts and talk time add up to
 * the totals. Person-days count a lead once in the total even when two reps
 * reached them the same day, so the rep rows can sum past it.
 *
 * Needs data GV OS doesn't capture (so not here): the rep's own wrap-up marks
 * (fake number, manual pickup), dialler-set bookings, triage.
 *
 * Pure: no clock, no database.
 */

import { isOutboundDirection } from "@/lib/crm/close-normalize";
import { dayKeyIn } from "@/lib/time/zone";

export const ATTEMPT_GAP_MS = 2 * 60 * 1000;
export const PICKUP_SECONDS = 30;
export const QUALITY_SECONDS = 5 * 60;

export type DialInput = {
  userId: string | null;
  userName: string | null;
  direction: string | null;
  durationSeconds: number | null;
  occurredAt: Date | null;
  leadId: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  /** Close's own disposition for the call, when it recorded one. */
  disposition: string | null;
};

export type Grain = {
  n: number;
  pickedUp: number;
  noAnswer: number;
  quality: number;
  /** pickedUp ÷ n, 0–100, null with nothing dialled. */
  pickupRate: number | null;
  /** quality ÷ pickedUp, 0–100, null with no pickups. */
  qualityRate: number | null;
};

export type DialingRow = {
  rep: string;
  /** True for the dials Close recorded with no rep. */
  unattributed: boolean;
  dial: Grain;
  attempt: Grain;
  person: Grain;
  talkSeconds: number;
  unmeasured: number;
};

export type DialingDetail = {
  total: DialingRow;
  byRep: DialingRow[];
  /** Outbound dials with no time — outside the per-person grain. */
  undated: number;
};

export const NO_REP = "No rep on the call";

type Mark = { pickedUp: boolean; noAnswer: boolean; quality: boolean };

const NO_ANSWER =
  /(no.?answer|busy|voicemail|vm.?(answer|left)|unanswered|missed|blocked|failed|error)/;

/** How one dial reads. */
export function markDial(d: Pick<DialInput, "durationSeconds" | "disposition">): Mark {
  const disposition = (d.disposition ?? "").trim().toLowerCase();
  const seconds = d.durationSeconds;
  const quality = seconds !== null && seconds >= QUALITY_SECONDS;
  if (disposition === "answered") return { pickedUp: true, noAnswer: false, quality };
  // A long voicemail is still not a conversation.
  if (NO_ANSWER.test(disposition))
    return { pickedUp: false, noAnswer: true, quality: false };
  if (seconds === null) return { pickedUp: false, noAnswer: false, quality: false };
  if (seconds >= PICKUP_SECONDS) return { pickedUp: true, noAnswer: false, quality };
  if (seconds === 0) return { pickedUp: false, noAnswer: true, quality: false };
  return { pickedUp: false, noAnswer: false, quality: false };
}

/** Who was dialled; a dial naming no lead is its own person, never lumped. */
const personOf = (d: DialInput, index: number): string =>
  d.leadId ?? d.leadEmail?.toLowerCase() ?? d.leadPhone ?? `dial:${index}`;

const rate = (num: number, den: number): number | null =>
  den === 0 ? null : (num / den) * 100;

function grain(groups: Mark[][]): Grain {
  let pickedUp = 0;
  let noAnswer = 0;
  let quality = 0;
  for (const marks of groups) {
    if (marks.some((m) => m.pickedUp)) pickedUp += 1;
    if (marks.every((m) => m.noAnswer)) noAnswer += 1;
    if (marks.some((m) => m.quality)) quality += 1;
  }
  return {
    n: groups.length,
    pickedUp,
    noAnswer,
    quality,
    pickupRate: rate(pickedUp, groups.length),
    qualityRate: rate(quality, pickedUp),
  };
}

function rowFor(rep: string, unattributed: boolean, dials: DialInput[], tz: string) {
  const marks = dials.map(markDial);

  // Attempts: per rep + person, in time order, split where the gap exceeds 2 min.
  const attempts: Mark[][] = [];
  const byRepPerson = new Map<string, { at: number; mark: Mark }[]>();
  dials.forEach((d, i) => {
    const key = `${d.userId ?? d.userName ?? ""}|${personOf(d, i)}`;
    const list = byRepPerson.get(key) ?? [];
    // Undated dials sort last and never join an attempt.
    list.push({
      at: d.occurredAt?.getTime() ?? Number.POSITIVE_INFINITY,
      mark: marks[i],
    });
    byRepPerson.set(key, list);
  });
  for (const list of byRepPerson.values()) {
    list.sort((a, b) => (a.at === b.at ? 0 : a.at - b.at));
    let current: Mark[] = [];
    let last = Number.POSITIVE_INFINITY;
    for (const { at, mark } of list) {
      const joins =
        current.length > 0 &&
        Number.isFinite(at) &&
        Number.isFinite(last) &&
        at - last <= ATTEMPT_GAP_MS;
      if (!joins && current.length > 0) {
        attempts.push(current);
        current = [];
      }
      current.push(mark);
      last = at;
    }
    attempts.push(current);
  }

  // Person-days: distinct (viewer's day, person); undated dials can't be placed.
  const people = new Map<string, Mark[]>();
  dials.forEach((d, i) => {
    if (!d.occurredAt) return;
    const key = `${dayKeyIn(d.occurredAt, tz)}|${personOf(d, i)}`;
    people.set(key, [...(people.get(key) ?? []), marks[i]]);
  });

  return {
    rep,
    unattributed,
    dial: grain(marks.map((m) => [m])),
    attempt: grain(attempts),
    person: grain([...people.values()]),
    talkSeconds: dials.reduce((s, d) => s + (d.durationSeconds ?? 0), 0),
    unmeasured: marks.filter((m) => !m.pickedUp && !m.noAnswer).length,
  };
}

export function dialingDetail(calls: DialInput[], timeZone: string): DialingDetail {
  const dials = calls.filter((c) => isOutboundDirection(c.direction));
  const byRepName = new Map<string, DialInput[]>();
  for (const d of dials) {
    const name = d.userName?.trim() || NO_REP;
    byRepName.set(name, [...(byRepName.get(name) ?? []), d]);
  }
  const byRep = [...byRepName.entries()]
    .map(([name, list]) => rowFor(name, name === NO_REP, list, timeZone))
    .sort(
      (a, b) =>
        Number(a.unattributed) - Number(b.unattributed) ||
        b.dial.n - a.dial.n ||
        a.rep.localeCompare(b.rep),
    );
  return {
    total: rowFor("All dials", true, dials, timeZone),
    byRep,
    undated: dials.filter((d) => !d.occurredAt).length,
  };
}
