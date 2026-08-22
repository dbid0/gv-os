import { NextResponse, type NextRequest } from "next/server";

import { captureBookingWebhook } from "@/lib/bookings/capture";
import { integrationForWebhookToken } from "@/lib/payments/capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Booking webhook catch endpoint — same capability-URL model as payments:
 * the long random token minted on the connection IS the auth. Unknown token
 * 404s; known token always 200s so a scheduler never retry-storms.
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
  const result = await captureBookingWebhook(integration, payload);
  return NextResponse.json({ ok: true, ...result });
}
