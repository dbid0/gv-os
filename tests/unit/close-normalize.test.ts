import { describe, expect, it } from "vitest";

import { isOutboundDirection, normalizeCloseActivity } from "@/lib/crm/close-normalize";

describe("normalizeCloseActivity", () => {
  it("normalizes a call with talk time", () => {
    const out = normalizeCloseActivity("call", {
      id: "acti_abc",
      user_id: "user_1",
      user_name: "Rep One",
      direction: "outbound",
      duration: 245,
      date_created: "2026-08-21T01:00:00.000000+00:00",
      lead_id: "lead_9",
    });
    expect(out).toEqual({
      externalId: "acti_abc",
      kind: "call",
      userId: "user_1",
      userName: "Rep One",
      direction: "outbound",
      durationSeconds: 245,
      occurredAt: "2026-08-21T01:00:00.000000+00:00",
      leadId: "lead_9",
    });
  });

  it("leaves duration null for sms and email", () => {
    expect(
      normalizeCloseActivity("sms", { id: "acti_s", duration: 99 })?.durationSeconds,
    ).toBeNull();
    expect(
      normalizeCloseActivity("email", { id: "acti_e" })?.durationSeconds,
    ).toBeNull();
  });

  it("rejects payloads without an id and blanks missing fields", () => {
    expect(normalizeCloseActivity("call", {})).toBeNull();
    const sparse = normalizeCloseActivity("sms", { id: "acti_x" });
    expect(sparse).toMatchObject({
      userId: null,
      userName: null,
      direction: null,
      occurredAt: null,
      leadId: null,
    });
  });
});

describe("the real Close envelope", () => {
  // Shape confirmed against a live /activity/call/ payload: these are the
  // exact keys and formats Close sends.
  const realShape = {
    id: "acti_abcdefghijklmnopqrstuvwxyz012345",
    user_id: "user_ABCDEFGHIJKLMNOPQRSTUVWXYZ01234",
    user_name: "yel akot",
    direction: "outbound",
    duration: 5,
    date_created: "2026-09-07T14:49:29.089000+00:00",
    lead_id: "lead_ABCDEFGHIJKLMNOPQRSTUVWXYZ01234",
  };

  it("reads every field of a live-shaped call", () => {
    const n = normalizeCloseActivity("call", realShape);
    expect(n).toEqual({
      externalId: realShape.id,
      kind: "call",
      userId: realShape.user_id,
      userName: "yel akot",
      direction: "outbound",
      durationSeconds: 5,
      occurredAt: realShape.date_created,
      leadId: realShape.lead_id,
    });
  });

  it("keeps the microsecond+offset timestamp parseable", () => {
    const n = normalizeCloseActivity("call", realShape);
    expect(Number.isNaN(Date.parse(n!.occurredAt!))).toBe(false);
  });

  it("an sms or email never carries talk time, even if a duration sneaks in", () => {
    const n = normalizeCloseActivity("sms", { ...realShape, duration: 99 });
    expect(n!.durationSeconds).toBeNull();
  });

  it("a zero-second dial is a real dial, not a null", () => {
    // 0 is falsy; a naive `|| null` would erase legitimate zero-duration
    // dials (straight to voicemail) from talk-time stats.
    const n = normalizeCloseActivity("call", { ...realShape, duration: 0 });
    expect(n!.durationSeconds).toBe(0);
  });

  it("drops a payload with no id rather than inventing an idempotency key", () => {
    expect(normalizeCloseActivity("call", { ...realShape, id: "" })).toBeNull();
  });
});

describe("isOutboundDirection", () => {
  it("treats a call/sms's own outbound word as outbound", () => {
    expect(isOutboundDirection("outbound")).toBe(true);
  });

  it("treats an email's DIFFERENT outbound word as outbound too", () => {
    // Confirmed against live captured data: Close's email activity says
    // "outgoing", not "outbound" — the same vocabulary calls and sms use.
    // A filter that only recognized "outbound" would silently drop every
    // outgoing email from speed-to-lead.
    expect(isOutboundDirection("outgoing")).toBe(true);
  });

  it("rejects both inbound spellings", () => {
    expect(isOutboundDirection("inbound")).toBe(false);
    expect(isOutboundDirection("incoming")).toBe(false);
  });

  it("rejects null and anything unrecognized", () => {
    expect(isOutboundDirection(null)).toBe(false);
    expect(isOutboundDirection("")).toBe(false);
    expect(isOutboundDirection("sideways")).toBe(false);
  });
});
