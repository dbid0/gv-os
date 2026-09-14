/**
 * THE END-OF-CALL FORM — what a closer files after every call, as a native
 * GV OS form with LOCKED counted fields.
 *
 * "Locked" is the reference product's rule: the software counts on these
 * fields, so their vocabulary is fixed here, in the database CHECKs, and in
 * the form — a team can add notes, never rename "no-show". Everything that
 * reads outcomes (stuck calls, confirmation rates) reads an
 * in-app report through `eocAsReport`, in the same words a sheet row uses, so
 * a call filed here and a call typed on the sheet count identically.
 *
 * A report is never money. Cash on a report is the closer's number, shown
 * beside the processor's record, and never enters the ledger.
 *
 * Pure: no clock except the `now` passed in, no database.
 */

import { fromDollars } from "@/lib/money";
import type { EocReport } from "@/lib/crm/confirmation-rates";

export const EOC_OUTCOMES = [
  { key: "closed", label: "Closed", hint: "They bought on the call." },
  { key: "follow_up", label: "Follow-up booked", hint: "Showed, not decided yet." },
  { key: "not_a_fit", label: "Showed, not a fit", hint: "Showed and won't buy." },
  { key: "no_show", label: "No-show", hint: "They never joined." },
  { key: "rescheduled", label: "Rescheduled", hint: "Moved to another time." },
  { key: "cancelled", label: "Cancelled", hint: "Called off before it happened." },
] as const;

export type EocOutcomeKey = (typeof EOC_OUTCOMES)[number]["key"];

export const CLOSE_TYPES = [
  { key: "pif", label: "Paid in full" },
  { key: "split", label: "Split pay" },
  { key: "deposit", label: "Deposit" },
  { key: "installments", label: "Installments" },
] as const;

export type CloseTypeKey = (typeof CLOSE_TYPES)[number]["key"];

const OUTCOME_KEYS = EOC_OUTCOMES.map((o) => o.key) as readonly string[];
const CLOSE_KEYS = CLOSE_TYPES.map((c) => c.key) as readonly string[];

/**
 * The words each locked outcome is written as when other code reads it — the
 * same vocabulary the sheet's EOC tab uses, so `readEocOutcome` and
 * `readCallResult` classify an in-app report exactly like a typed row.
 */
export const OUTCOME_WORDS: Record<EocOutcomeKey, string> = {
  closed: "closed won",
  follow_up: "follow up",
  not_a_fit: "not a fit",
  no_show: "no show",
  rescheduled: "rescheduled",
  cancelled: "cancelled",
};

export function outcomeLabel(key: string): string {
  return EOC_OUTCOMES.find((o) => o.key === key)?.label ?? key;
}

export function closeTypeLabel(key: string | null): string | null {
  if (!key) return null;
  return CLOSE_TYPES.find((c) => c.key === key)?.label ?? key;
}

/** What the form submits, as typed. */
export type EocFormInput = {
  leadEmail: string;
  paymentEmail: string;
  outcome: string;
  closeType: string;
  /** Dollars as typed. */
  cashCollected: string;
  /** Dollars as typed. */
  contractValue: string;
  closerRepId: string;
  setterRepId: string;
  recordingUrl: string;
  notes: string;
};

/** A validated report, ready to store. */
export type CleanEoc = {
  leadEmail: string;
  paymentEmail: string | null;
  outcome: EocOutcomeKey;
  closeType: CloseTypeKey | null;
  cashCollectedCents: number | null;
  contractValueCents: number | null;
  closerRepId: string | null;
  setterRepId: string | null;
  recordingUrl: string | null;
  notes: string | null;
};

export type EocValidation =
  { ok: true; eoc: CleanEoc } | { ok: false; errors: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const blankToNull = (v: string): string | null => {
  const t = v.trim();
  return t.length > 0 ? t : null;
};

function money(raw: string): number | null | "invalid" {
  const t = raw.trim();
  if (!t) return null;
  try {
    const value = fromDollars(t);
    return value < 0 ? "invalid" : value;
  } catch {
    return "invalid";
  }
}

/**
 * Validate a submission. Close fields are required on a close and refused on
 * anything else, so a no-show can never carry a contract value into a count.
 * Every error says what to fix.
 */
export function validateEoc(input: EocFormInput, repIds: Set<string>): EocValidation {
  const errors: string[] = [];

  const leadEmail = input.leadEmail.trim().toLowerCase();
  if (!EMAIL.test(leadEmail)) {
    errors.push("Enter the lead's email as they booked, like name@example.com.");
  }
  const paymentEmail = blankToNull(input.paymentEmail)?.toLowerCase() ?? null;
  if (paymentEmail !== null && !EMAIL.test(paymentEmail)) {
    errors.push(
      "The payment email doesn't look like an email. Leave it blank if they paid from the same one.",
    );
  }

  const outcome = input.outcome as EocOutcomeKey;
  if (!OUTCOME_KEYS.includes(outcome)) {
    errors.push("Pick what happened on the call.");
  }
  const closed = outcome === "closed";

  const closeType = blankToNull(input.closeType) as CloseTypeKey | null;
  const cash = money(input.cashCollected);
  const contract = money(input.contractValue);

  if (closed) {
    if (closeType === null || !CLOSE_KEYS.includes(closeType)) {
      errors.push(
        "A close needs a close type: paid in full, split pay, deposit or installments.",
      );
    }
    if (contract === null || contract === "invalid") {
      errors.push("Enter the total contract value in dollars, like 6000.");
    }
    if (cash === null || cash === "invalid") {
      errors.push(
        "Enter the cash taken on the call in dollars. Use 0 if nothing was paid yet.",
      );
    }
    if (typeof cash === "number" && typeof contract === "number" && cash > contract) {
      errors.push("Cash taken can't be more than the contract value.");
    }
  } else if (closeType !== null || cash !== null || contract !== null) {
    errors.push(
      "Close type, cash and contract value only apply to a closed call. Clear them or mark the call closed.",
    );
  }

  const closerRepId = blankToNull(input.closerRepId);
  const setterRepId = blankToNull(input.setterRepId);
  for (const [label, id] of [
    ["closer", closerRepId],
    ["setter", setterRepId],
  ] as const) {
    if (id !== null && (!UUID.test(id) || !repIds.has(id))) {
      errors.push(
        `That ${label} isn't on this offer's team. Pick someone from the list.`,
      );
    }
  }

  const recordingUrl = blankToNull(input.recordingUrl);
  if (recordingUrl !== null && !/^https:\/\/\S+$/i.test(recordingUrl)) {
    errors.push("The recording link must be a full https:// link.");
  }
  const notes = blankToNull(input.notes);
  if (notes !== null && notes.length > 5000) {
    errors.push("Keep notes under 5,000 characters.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    eoc: {
      leadEmail,
      paymentEmail: paymentEmail === leadEmail ? null : paymentEmail,
      outcome,
      closeType: closed ? closeType : null,
      cashCollectedCents: closed ? (cash as number) : null,
      contractValueCents: closed ? (contract as number) : null,
      closerRepId,
      setterRepId,
      recordingUrl,
      notes,
    },
  };
}

/** A stored in-app report in the shape every outcome reader already speaks. */
export function eocAsReport(row: {
  leadEmail: string;
  outcome: string;
  callAt: Date;
}): EocReport {
  return {
    email: row.leadEmail,
    status: OUTCOME_WORDS[row.outcome as EocOutcomeKey] ?? row.outcome,
    outcome: null,
    occurredAt: row.callAt,
  };
}

/**
 * When the call happened: the booking's start when the report is for a booked
 * call that already started, otherwise the moment it was filed. A report is
 * never dated in the future.
 */
export function callTimeFor(bookingStartsAt: Date | null, now: Date): Date {
  if (bookingStartsAt && bookingStartsAt.getTime() <= now.getTime())
    return bookingStartsAt;
  return now;
}
