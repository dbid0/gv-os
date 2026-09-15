import { describe, expect, it } from "vitest";

import {
  dialingDetail,
  markDial,
  NO_REP,
  PICKUP_SECONDS,
  QUALITY_SECONDS,
  type DialInput,
} from "@/lib/crm/dialing-detail";

const TZ = "America/Chicago";
const T0 = new Date("2026-09-10T15:00:00Z").getTime();
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

function dial(extra: Partial<DialInput>): DialInput {
  return {
    userId: "u1",
    userName: "Sam Carter",
    direction: "outbound",
    durationSeconds: 0,
    occurredAt: at(0),
    leadId: "lead_a",
    leadEmail: null,
    leadPhone: null,
    disposition: null,
    ...extra,
  };
}

describe("markDial", () => {
  it("trusts Close's disposition first", () => {
    expect(markDial({ disposition: "answered", durationSeconds: 5 })).toEqual({
      pickedUp: true,
      noAnswer: false,
      quality: false,
    });
    expect(markDial({ disposition: "answered", durationSeconds: 400 }).quality).toBe(
      true,
    );
    expect(markDial({ disposition: "no-answer", durationSeconds: 40 })).toEqual({
      pickedUp: false,
      noAnswer: true,
      quality: false,
    });
    expect(markDial({ disposition: "vm-left", durationSeconds: 400 })).toEqual({
      pickedUp: false,
      noAnswer: true,
      quality: false,
    });
    expect(markDial({ disposition: "Busy", durationSeconds: null }).noAnswer).toBe(
      true,
    );
    expect(markDial({ disposition: "blocked", durationSeconds: 0 }).noAnswer).toBe(
      true,
    );
  });

  it("falls back to talk time without a disposition", () => {
    expect(markDial({ disposition: null, durationSeconds: PICKUP_SECONDS })).toEqual({
      pickedUp: true,
      noAnswer: false,
      quality: false,
    });
    expect(markDial({ disposition: null, durationSeconds: QUALITY_SECONDS })).toEqual({
      pickedUp: true,
      noAnswer: false,
      quality: true,
    });
    expect(markDial({ disposition: "", durationSeconds: 0 })).toEqual({
      pickedUp: false,
      noAnswer: true,
      quality: false,
    });
  });

  it("leaves a short or unknown-length call unmeasured, never guessed", () => {
    const unmeasured = { pickedUp: false, noAnswer: false, quality: false };
    expect(markDial({ disposition: null, durationSeconds: 12 })).toEqual(unmeasured);
    expect(markDial({ disposition: null, durationSeconds: null })).toEqual(unmeasured);
    expect(markDial({ disposition: "answered", durationSeconds: null }).quality).toBe(
      false,
    );
    expect(markDial({ disposition: "something-new", durationSeconds: 3 })).toEqual(
      unmeasured,
    );
  });
});

describe("dialingDetail", () => {
  // Sam: lead A double-dialled (no answer, then a 6-minute pickup 1 min later),
  //      lead A again 3 hours later (no answer) → 3 dials, 2 attempts, 1 person-day.
  //      lead B dialled 12s, no disposition → unmeasured.
  // Jordan: lead A the same day, answered 45s → Jordan's own person-day; the
  //      total counts lead A once for that day.
  //      one inbound call — not a dial.
  // No rep: one dial with no lead at all, zero seconds.
  const calls: DialInput[] = [
    dial({ occurredAt: at(0), durationSeconds: 0 }),
    dial({ occurredAt: at(1), durationSeconds: 360, disposition: "answered" }),
    dial({ occurredAt: at(180), durationSeconds: 0 }),
    dial({ leadId: "lead_b", occurredAt: at(10), durationSeconds: 12 }),
    dial({
      userId: "u2",
      userName: "Jordan Rivers",
      occurredAt: at(30),
      durationSeconds: 45,
      disposition: "answered",
    }),
    dial({ userId: "u2", userName: "Jordan Rivers", direction: "inbound" }),
    dial({
      userId: null,
      userName: null,
      leadId: null,
      occurredAt: at(5),
      durationSeconds: 0,
    }),
  ];
  const d = dialingDetail(calls, TZ);

  it("counts the three grains for the whole floor", () => {
    expect(d.total.dial).toMatchObject({ n: 6, pickedUp: 2, noAnswer: 3, quality: 1 });
    // Sam→A (0,1) · Sam→A (180) · Sam→B · Jordan→A · no rep
    expect(d.total.attempt).toMatchObject({
      n: 5,
      pickedUp: 2,
      noAnswer: 2,
      quality: 1,
    });
    // A that day (Sam + Jordan together) · B · the unnamed dial
    expect(d.total.person).toMatchObject({
      n: 3,
      pickedUp: 1,
      noAnswer: 1,
      quality: 1,
    });
    expect(d.total.talkSeconds).toBe(417);
    expect(d.total.unmeasured).toBe(1);
    expect(d.undated).toBe(0);
  });

  it("names rates over their own denominators", () => {
    expect(d.total.dial.pickupRate).toBeCloseTo((2 / 6) * 100);
    expect(d.total.dial.qualityRate).toBe(50);
    expect(d.total.person.pickupRate).toBeCloseTo((1 / 3) * 100);
  });

  it("re-cuts per rep, with dials and attempts adding up to the total", () => {
    expect(d.byRep.map((r) => [r.rep, r.dial.n, r.attempt.n, r.person.n])).toEqual([
      ["Sam Carter", 4, 3, 2],
      ["Jordan Rivers", 1, 1, 1],
      [NO_REP, 1, 1, 1],
    ]);
    const sum = (f: (r: (typeof d.byRep)[number]) => number) =>
      d.byRep.reduce((s, r) => s + f(r), 0);
    expect(sum((r) => r.dial.n)).toBe(d.total.dial.n);
    expect(sum((r) => r.attempt.n)).toBe(d.total.attempt.n);
    expect(sum((r) => r.talkSeconds)).toBe(d.total.talkSeconds);
    expect(d.byRep.at(-1)?.unattributed).toBe(true);
  });

  it("never joins undated dials into an attempt or a person-day", () => {
    const undated = dialingDetail(
      [
        dial({ occurredAt: null }),
        dial({ occurredAt: null, durationSeconds: null }),
        dial({ occurredAt: at(0), durationSeconds: 40 }),
      ],
      TZ,
    );
    // An unknown length adds nothing to talk time.
    expect(undated.total.talkSeconds).toBe(40);
    expect(undated.total.attempt.n).toBe(3);
    expect(undated.total.person.n).toBe(1);
    expect(undated.undated).toBe(2);
  });

  it("identifies the person by lead id, then email, then phone", () => {
    const byKey = dialingDetail(
      [
        dial({ leadId: null, leadEmail: "X@Example.test", occurredAt: at(0) }),
        dial({ leadId: null, leadEmail: "x@example.test", occurredAt: at(1) }),
        dial({ leadId: null, leadPhone: "5550102030", occurredAt: at(10) }),
      ],
      TZ,
    );
    expect(byKey.total.attempt.n).toBe(2);
    expect(byKey.total.person.n).toBe(2);
  });

  it("is honest when nothing was dialled", () => {
    const none = dialingDetail([dial({ direction: "inbound" })], TZ);
    expect(none.total.dial).toEqual({
      n: 0,
      pickedUp: 0,
      noAnswer: 0,
      quality: 0,
      pickupRate: null,
      qualityRate: null,
    });
    expect(none.byRep).toEqual([]);
  });

  it("orders reps by dials, then name", () => {
    const tie = dialingDetail(
      [
        dial({ userId: "z", userName: "Zed", leadId: "1" }),
        dial({ userId: "a", userName: "Avery", leadId: "2" }),
      ],
      TZ,
    );
    expect(tie.byRep.map((r) => r.rep)).toEqual(["Avery", "Zed"]);
  });
});
