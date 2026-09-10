import { NextResponse, type NextRequest } from "next/server";

import { capturePayment, integrationForWebhookToken } from "@/lib/payments/capture";
import { verifyStripeSignature } from "@/lib/payments/stripe-signature";
import { open } from "@/lib/crypto/secretbox";
import { serverEnv } from "@/env.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payment webhook catch endpoint — one URL per connection, keyed by the
 * long random token minted when the integration was connected (the Zapier
 * catch-hook model; no signature scheme is portable across Fanbasis, Whop,
 * Commas, and Shopify, so the capability URL is the shared secret).
 *
 * DEFENSE IN DEPTH: a connection that has saved its Stripe signing secret
 * additionally requires a valid Stripe-Signature on every delivery —
 * HMAC over the RAW body, constant-time compare, replay tolerance. A bad
 * signature is a hard 400 (Stripe will retry and surface the failure in
 * its delivery log, which is exactly where we want it noticed).
 *
 * An unknown token 404s — this is not an open sink. A known token always
 * gets 200 for parseable-but-unwanted payloads, so a processor never
 * retry-storms us.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const integration = await integrationForWebhookToken(token);
  if (!integration) {
    return NextResponse.json({ error: "Unknown endpoint." }, { status: 404 });
  }

  // The signature covers the raw bytes — read text first, parse after.
  const rawBody = await req.text();

  const secretBox = (integration.config as { webhook_secret_box?: string })
    .webhook_secret_box;
  if (secretBox) {
    const key = serverEnv().CREDENTIALS_KEY;
    if (!key) {
      return NextResponse.json({ error: "Vault unavailable." }, { status: 503 });
    }
    const verdict = verifyStripeSignature(
      rawBody,
      req.headers.get("stripe-signature"),
      open(secretBox, key),
      Math.floor(Date.now() / 1000),
    );
    if (!verdict.ok) {
      return NextResponse.json(
        { error: `Signature check failed (${verdict.reason}).` },
        { status: 400 },
      );
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true, captured: false, reason: "not-json" });
  }

  const result = await capturePayment(integration, payload);
  return NextResponse.json({ ok: true, ...result });
}
