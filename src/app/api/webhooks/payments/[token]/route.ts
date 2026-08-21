import { NextResponse, type NextRequest } from "next/server";

import { capturePayment, integrationForWebhookToken } from "@/lib/payments/capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payment webhook catch endpoint — one URL per connection, keyed by the
 * long random token minted when the integration was connected (the Zapier
 * catch-hook model; no signature scheme is portable across Fanbasis, Whop,
 * Commas, and Shopify, so the capability URL is the shared secret).
 *
 * An unknown token 404s — this is not an open sink. A known token always
 * gets 200, even for a payload we can't parse, so a processor never
 * retry-storms us; unparseable payloads are captured nowhere but reported
 * in the response for debugging in the processor's delivery log.
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

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true, captured: false, reason: "not-json" });
  }

  const result = await capturePayment(integration, payload);
  return NextResponse.json({ ok: true, ...result });
}
