import { NextResponse, type NextRequest } from "next/server";

import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { pullCalendlyBookings } from "@/lib/bookings/capture";
import { pullCloseActivity } from "@/lib/crm/close-sync";
import { pullKitSnapshots } from "@/lib/email/kit-sync";
import { pullStripeEvents } from "@/lib/payments/capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * All integration pulls in one call — the daily Vercel cron target (Hobby
 * allows two daily crons; this is one of them, the drift check is the other).
 * Every pull is idempotent, and each source fails soft so one bad key never
 * blocks the others. GET because Vercel cron only issues GETs; Vercel adds
 * `Authorization: Bearer ${CRON_SECRET}` automatically, and CRON_SECRET is set
 * to the same value as SYNC_SECRET.
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.SYNC_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  const user = await currentUser();
  return Boolean(user?.email && isAllowed(user.email));
}

async function runAll() {
  const out: Record<string, unknown> = {};
  for (const [name, fn] of [
    ["close", pullCloseActivity],
    ["bookings", pullCalendlyBookings],
    ["kit", pullKitSnapshots],
    ["stripe", pullStripeEvents],
  ] as const) {
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : "failed" };
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await runAll()) });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
