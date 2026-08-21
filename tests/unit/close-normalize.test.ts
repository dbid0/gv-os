import { describe, expect, it } from "vitest";

import { normalizeCloseActivity } from "@/lib/crm/close-normalize";

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
