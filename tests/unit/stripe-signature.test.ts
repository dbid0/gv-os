import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

import { verifyStripeSignature } from "@/lib/payments/stripe-signature";

const SECRET = "whsec_test_secret";
const BODY = '{"id":"evt_1","type":"charge.succeeded"}';
const NOW = 1_800_000_000;

const sign = (ts: number, body: string, secret = SECRET) =>
  `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;

describe("verifyStripeSignature", () => {
  it("accepts a valid signature within tolerance", () => {
    expect(verifyStripeSignature(BODY, sign(NOW - 10, BODY), SECRET, NOW)).toEqual({
      ok: true,
    });
  });

  it("rejects a signature made with the wrong secret", () => {
    const header = sign(NOW, BODY, "whsec_other");
    expect(verifyStripeSignature(BODY, header, SECRET, NOW)).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects a tampered body", () => {
    const header = sign(NOW, BODY);
    expect(
      verifyStripeSignature(BODY.replace("evt_1", "evt_2"), header, SECRET, NOW),
    ).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a stale timestamp — replay protection", () => {
    const header = sign(NOW - 3600, BODY);
    expect(verifyStripeSignature(BODY, header, SECRET, NOW)).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("rejects missing or malformed headers", () => {
    expect(verifyStripeSignature(BODY, null, SECRET, NOW).ok).toBe(false);
    expect(verifyStripeSignature(BODY, "garbage", SECRET, NOW).ok).toBe(false);
    expect(verifyStripeSignature(BODY, "t=abc,v1=", SECRET, NOW).ok).toBe(false);
  });

  it("accepts when any one of several v1 entries matches (key roll)", () => {
    const good = sign(NOW, BODY);
    const rolled = `t=${NOW},v1=deadbeef,${good.split(",")[1]}`;
    expect(verifyStripeSignature(BODY, rolled, SECRET, NOW)).toEqual({ ok: true });
  });
});
