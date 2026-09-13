import { NextResponse, type NextRequest } from "next/server";

import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { pullCalendlyBookings, pullIclosedBookings } from "@/lib/bookings/capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Calendly + iClosed bookings pull. Secret-gated; no DISABLE_AUTH bypass. */
async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.SYNC_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  const user = await currentUser();
  return Boolean(user?.email && isAllowed(user.email));
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  try {
    // Independent providers, independent failure domains — one pull erroring
    // must never hide the other's results.
    const [calendly, iclosed] = await Promise.all([
      pullCalendlyBookings(),
      pullIclosedBookings(),
    ]);
    return NextResponse.json({ ok: true, connections: [...calendly, ...iclosed] });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Pull failed." },
      { status: 500 },
    );
  }
}

/** Vercel-cron/all-pulls compatible GET. */
export async function GET(req: NextRequest) {
  return POST(req);
}
