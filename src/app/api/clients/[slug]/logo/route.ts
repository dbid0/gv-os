import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";

/**
 * A client's logo, served as a real cached image.
 *
 * Logos live in the DB as inline data URLs (up to ~135KB each). Rendering them
 * inline meant the app shell shipped EVERY active client's logo in the RSC
 * payload on every navigation (~500KB). This route serves one client's logo as
 * raw bytes with a long cache header instead, so the payload carries a short URL
 * and the browser/CDN cache the image itself.
 *
 * Public (see middleware PUBLIC_PATHS) — it's just a logo. A missing logo 404s,
 * which lets <ClientLogo> fall back to the accent-coloured initial.
 *
 * Node runtime: the edge runtime can't open a Postgres socket, and it needs
 * Buffer to decode the base64 body.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// data:image/png;base64,AAAA…  → capture mime + base64 body.
const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  try {
    const db = getDb();
    const [row] = await db
      .select({ logo: clients.logo })
      .from(clients)
      .where(and(eq(clients.slug, slug), eq(clients.status, "active")))
      .limit(1);

    const match = row?.logo ? DATA_URL.exec(row.logo) : null;
    if (!match) return new NextResponse(null, { status: 404 });

    const [, mime, base64] = match;
    const bytes = Buffer.from(base64, "base64");
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    // Fail-soft: a DB hiccup 404s and the caller shows the initial fallback,
    // exactly as if the logo were missing. It never breaks a page render.
    return new NextResponse(null, { status: 404 });
  }
}
