/**
 * Stripe-Signature verification — defense in depth on the payment webhook.
 *
 * The capability URL's random token already gates the endpoint; when a
 * connection also saves its Stripe signing secret, every delivery must
 * additionally carry a valid `Stripe-Signature` header: HMAC-SHA256 of
 * `${timestamp}.${rawBody}` with the signing secret, compared in constant
 * time, timestamp within tolerance so a captured request can't be replayed
 * later. Pure and clock-injected for tests.
 */

import { createHmac, timingSafeEqual } from "crypto";

export const DEFAULT_TOLERANCE_SEC = 300;

export type SignatureVerdict =
  { ok: true } | { ok: false; reason: "malformed" | "stale" | "mismatch" };

export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  signingSecret: string,
  nowSec: number,
  toleranceSec = DEFAULT_TOLERANCE_SEC,
): SignatureVerdict {
  if (!header) return { ok: false, reason: "malformed" };

  let timestamp: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s?.trim());
    if (k === "t" && v && /^\d+$/.test(v)) timestamp = Number(v);
    if (k === "v1" && v) v1.push(v);
  }
  if (timestamp === null || v1.length === 0) return { ok: false, reason: "malformed" };
  if (Math.abs(nowSec - timestamp) > toleranceSec)
    return { ok: false, reason: "stale" };

  const expected = createHmac("sha256", signingSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  for (const candidate of v1) {
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (
      candidateBuf.length === expectedBuf.length &&
      timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "mismatch" };
}
