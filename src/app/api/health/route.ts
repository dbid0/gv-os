import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";

/**
 * Liveness + warmth probe.
 *
 * Public (see middleware PUBLIC_PATHS) and deliberately touches the database
 * with a trivial `select 1`. A scheduled ping to this route (see
 * .github/workflows/keep-warm.yml) keeps BOTH the serverless function and the
 * Postgres connection pool warm — which is what stops the first click after an
 * idle stretch from hanging while a cold connection is established.
 *
 * Node runtime, not edge: the edge runtime can't open a Postgres socket.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true, db: "up", ms: Date.now() - started });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        ms: Date.now() - started,
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 503 },
    );
  }
}
