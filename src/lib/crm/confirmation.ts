/**
 * Confirmation judgement — pure rules for what "confirmed" means.
 *
 * The reference numbers this feeds (later): show rate and close rate split by
 * confirmed vs unconfirmed, "confirmed, awaiting call", and confirmed-then-
 * cancelled. The rule that keeps those honest: a confirmation only counts for
 * a call when it was recorded BEFORE the call's start time. Confirming a call
 * after it happened tells you nothing about whether confirming works.
 */

export type ConfirmableCall = {
  id: string;
  startsAt: Date | null;
  /** booked · canceled · unknown */
  status: string;
};

export type ConfirmationRecord = {
  bookingId: string;
  confirmedAt: Date | null;
};

/** True when the confirmation happened before the call started. */
export function confirmedBeforeCall(
  confirmedAt: Date | null,
  startsAt: Date | null,
): boolean {
  if (!confirmedAt || !startsAt) return false;
  return confirmedAt.getTime() < startsAt.getTime();
}

export type ConfirmationSplit = {
  /** Calls with a confirmation recorded before their start. */
  confirmed: ConfirmableCall[];
  /** Calls with no (timely) confirmation. */
  unconfirmed: ConfirmableCall[];
  /** Booked, confirmed in time, start still in the future — the good queue. */
  confirmedAwaiting: number;
  /** Confirmed in time and then cancelled anyway — the flake signal. */
  confirmedThenCancelled: number;
};

/**
 * Split calls by timely confirmation. Calls missing a start time land in
 * `unconfirmed` — an unscheduled call cannot have been confirmed "in time",
 * and hiding it entirely would quietly shrink the denominator.
 */
export function splitByConfirmation(
  calls: ConfirmableCall[],
  confirmations: ConfirmationRecord[],
  now: Date,
): ConfirmationSplit {
  const confirmedAtBy = new Map<string, Date | null>();
  for (const c of confirmations) {
    if (c.confirmedAt) confirmedAtBy.set(c.bookingId, c.confirmedAt);
  }

  const split: ConfirmationSplit = {
    confirmed: [],
    unconfirmed: [],
    confirmedAwaiting: 0,
    confirmedThenCancelled: 0,
  };

  for (const call of calls) {
    const at = confirmedAtBy.get(call.id) ?? null;
    const timely = confirmedBeforeCall(at, call.startsAt);
    if (!timely) {
      split.unconfirmed.push(call);
      continue;
    }
    split.confirmed.push(call);
    if (call.status === "canceled") {
      split.confirmedThenCancelled += 1;
    } else if (
      call.status === "booked" &&
      call.startsAt &&
      call.startsAt.getTime() > now.getTime()
    ) {
      split.confirmedAwaiting += 1;
    }
  }

  return split;
}
