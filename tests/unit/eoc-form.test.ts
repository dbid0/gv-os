import { describe, expect, it } from "vitest";

import {
  callTimeFor,
  closeTypeLabel,
  EOC_OUTCOMES,
  eocAsReport,
  OUTCOME_WORDS,
  outcomeLabel,
  validateEoc,
  type EocFormInput,
} from "@/lib/calls/eoc-form";
import { readEocOutcome } from "@/lib/crm/confirmation-rates";

const REP_A = "11111111-1111-4111-8111-111111111111";
const REP_B = "22222222-2222-4222-8222-222222222222";
const REPS = new Set([REP_A, REP_B]);

function input(extra: Partial<EocFormInput> = {}): EocFormInput {
  return {
    leadEmail: " Lead@Example.com ",
    paymentEmail: "",
    outcome: "follow_up",
    closeType: "",
    cashCollected: "",
    contractValue: "",
    closerRepId: "",
    setterRepId: "",
    recordingUrl: "",
    notes: "",
    ...extra,
  };
}

const closedInput = (extra: Partial<EocFormInput> = {}) =>
  input({
    outcome: "closed",
    closeType: "split",
    contractValue: "6,000",
    cashCollected: "3000.50",
    ...extra,
  });

describe("validateEoc", () => {
  it("cleans a non-close report: email lowercased, blanks to null, no money", () => {
    const res = validateEoc(input({ notes: "  wants to talk to spouse  " }), REPS);
    expect(res).toEqual({
      ok: true,
      eoc: {
        leadEmail: "lead@example.com",
        paymentEmail: null,
        outcome: "follow_up",
        closeType: null,
        cashCollectedCents: null,
        contractValueCents: null,
        closerRepId: null,
        setterRepId: null,
        recordingUrl: null,
        notes: "wants to talk to spouse",
      },
    });
  });

  it("stores a close in integer cents with its reps and recording", () => {
    const res = validateEoc(
      closedInput({
        closerRepId: REP_A,
        setterRepId: REP_B,
        recordingUrl: "https://fathom.video/call/1",
        paymentEmail: "Other@Example.com",
      }),
      REPS,
    );
    expect(res.ok && res.eoc).toMatchObject({
      outcome: "closed",
      closeType: "split",
      contractValueCents: 600_000,
      cashCollectedCents: 300_050,
      closerRepId: REP_A,
      setterRepId: REP_B,
      recordingUrl: "https://fathom.video/call/1",
      paymentEmail: "other@example.com",
    });
  });

  it("allows a close with nothing paid on the call yet", () => {
    const res = validateEoc(closedInput({ cashCollected: "0" }), REPS);
    expect(res.ok && res.eoc.cashCollectedCents).toBe(0);
  });

  it("drops a payment email identical to the lead email", () => {
    const res = validateEoc(closedInput({ paymentEmail: "LEAD@example.com" }), REPS);
    expect(res.ok && res.eoc.paymentEmail).toBeNull();
  });

  it("requires close type, contract value and cash on a close", () => {
    const res = validateEoc(input({ outcome: "closed" }), REPS);
    expect(res.ok).toBe(false);
    const text = !res.ok ? res.errors.join(" | ") : "";
    expect(text).toMatch(/close type/);
    expect(text).toMatch(/contract value/);
    expect(text).toMatch(/cash taken/);
  });

  it("rejects unparseable, negative or three-decimal money on a close", () => {
    for (const bad of ["abc", "-5", "10.005"]) {
      const res = validateEoc(closedInput({ contractValue: bad }), REPS);
      expect(!res.ok && res.errors.join(" ")).toMatch(/contract value/);
      const res2 = validateEoc(closedInput({ cashCollected: bad }), REPS);
      expect(!res2.ok && res2.errors.join(" ")).toMatch(/cash taken/);
    }
  });

  it("rejects an unknown close type", () => {
    const res = validateEoc(closedInput({ closeType: "barter" }), REPS);
    expect(!res.ok && res.errors.join(" ")).toMatch(/close type/);
  });

  it("refuses cash taken above the contract value", () => {
    const res = validateEoc(
      closedInput({ contractValue: "1000", cashCollected: "1000.01" }),
      REPS,
    );
    expect(!res.ok && res.errors).toEqual([
      "Cash taken can't be more than the contract value.",
    ]);
  });

  it("refuses close fields on a call that did not close", () => {
    for (const extra of [
      { closeType: "pif" },
      { cashCollected: "100" },
      { contractValue: "100" },
    ]) {
      const res = validateEoc(input({ outcome: "no_show", ...extra }), REPS);
      expect(!res.ok && res.errors.join(" ")).toMatch(/only apply to a closed call/);
    }
  });

  it("rejects a bad lead email, a bad payment email and a missing outcome", () => {
    const res = validateEoc(
      input({ leadEmail: "nope", paymentEmail: "also nope", outcome: "" }),
      REPS,
    );
    expect(!res.ok && res.errors).toHaveLength(3);
  });

  it("only accepts reps from this offer's team", () => {
    const outsider = "33333333-3333-4333-8333-333333333333";
    const res = validateEoc(input({ closerRepId: outsider, setterRepId: "x" }), REPS);
    expect(!res.ok && res.errors).toEqual([
      "That closer isn't on this offer's team. Pick someone from the list.",
      "That setter isn't on this offer's team. Pick someone from the list.",
    ]);
  });

  it("requires an https recording link and caps notes", () => {
    const link = validateEoc(input({ recordingUrl: "fathom.video/x" }), REPS);
    expect(!link.ok && link.errors.join(" ")).toMatch(/https/);
    const long = validateEoc(input({ notes: "x".repeat(5001) }), REPS);
    expect(!long.ok && long.errors.join(" ")).toMatch(/5,000/);
  });
});

describe("the locked vocabulary", () => {
  it("every outcome reads back through the shared outcome reader as intended", () => {
    const expected: Record<string, string> = {
      closed: "closed",
      follow_up: "showed",
      not_a_fit: "showed",
      no_show: "no_show",
      rescheduled: "not_held",
      cancelled: "not_held",
    };
    for (const o of EOC_OUTCOMES) {
      expect(readEocOutcome(OUTCOME_WORDS[o.key], null)).toBe(expected[o.key]);
    }
  });

  it("eocAsReport speaks the report shape, falling back to the raw key", () => {
    const at = new Date("2026-09-10T15:00:00Z");
    expect(
      eocAsReport({ leadEmail: "a@x.com", outcome: "no_show", callAt: at }),
    ).toEqual({
      email: "a@x.com",
      status: "no show",
      outcome: null,
      occurredAt: at,
    });
    expect(
      eocAsReport({ leadEmail: "a@x.com", outcome: "mystery", callAt: at }).status,
    ).toBe("mystery");
  });

  it("labels outcomes and close types, passing unknowns through", () => {
    expect(outcomeLabel("not_a_fit")).toBe("Showed, not a fit");
    expect(outcomeLabel("mystery")).toBe("mystery");
    expect(closeTypeLabel("pif")).toBe("Paid in full");
    expect(closeTypeLabel("barter")).toBe("barter");
    expect(closeTypeLabel(null)).toBeNull();
  });
});

describe("callTimeFor", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  it("uses the booking start once the call has started", () => {
    const start = new Date("2026-09-14T10:00:00Z");
    expect(callTimeFor(start, now)).toBe(start);
  });
  it("uses the filing time for a future booking or no booking", () => {
    expect(callTimeFor(new Date("2026-09-15T10:00:00Z"), now)).toBe(now);
    expect(callTimeFor(null, now)).toBe(now);
  });
});
