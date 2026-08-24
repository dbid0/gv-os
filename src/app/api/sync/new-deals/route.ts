import { NextResponse, type NextRequest } from "next/server";
import { isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { importNewDealsForOffer } from "@/lib/sheets/import-new-deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * New-deal importer trigger. MANUAL only — deliberately NOT on any cron. A
 * signed-in admin (the in-app button) or `Authorization: Bearer <SYNC_SECRET>`
 * can run it; everything else is 401. Idempotent, so re-running is safe.
 *
 * `?slug=the-grid` imports one offer; no slug imports every offer that has a
 * tracking sheet connected.
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.SYNC_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  const user = await currentUser();
  return Boolean(user?.email && isAllowed(user.email));
}

async function run(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const slug = new URL(req.url).searchParams.get("slug");
  const db = getDb();
  const offers = slug
    ? [{ slug }]
    : await db
        .select({ slug: clients.slug })
        .from(clients)
        .where(isNotNull(clients.trackingSheetId));

  const results: Record<string, unknown> = {};
  for (const o of offers) {
    try {
      results[o.slug] = await importNewDealsForOffer(o.slug);
    } catch (e) {
      results[o.slug] = { error: e instanceof Error ? e.message : "failed" };
    }
  }
  return NextResponse.json({ ok: true, results });
}

export async function POST(req: NextRequest) {
  return run(req);
}
export async function GET(req: NextRequest) {
  return run(req);
}
