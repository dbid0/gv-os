import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";
import { connectIntegrationCore } from "@/lib/integrations/connect";
import { PROVIDER_VALUES } from "@/lib/integrations/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Machine door for connecting an integration — the SAME sealed core the
 * Settings form uses, guarded the way the sync trigger is (SYNC_SECRET).
 *
 * Why it exists: the credentials key lives only in this environment (a
 * sensitive var), so a credential can only be sealed HERE. An operator hands
 * it to the app over HTTPS exactly as the form would; plaintext is sealed
 * before insert and never returned or logged.
 */
const input = z.object({
  provider: z.enum(PROVIDER_VALUES),
  clientSlug: z.string().min(1).nullable().optional(),
  label: z.string().min(1),
  secret: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const body = parsed.data;

  let clientId: string | null = null;
  if (body.clientSlug) {
    const db = getDb();
    const [row] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.slug, body.clientSlug))
      .limit(1);
    if (!row) return NextResponse.json({ error: "No such client." }, { status: 404 });
    clientId = row.id;
  }

  const row = await connectIntegrationCore({
    provider: body.provider,
    label: body.label,
    method: "api_key",
    secret: body.secret,
    clientId,
  });
  return NextResponse.json({ ok: true, id: row.id, hint: row.secretHint });
}
