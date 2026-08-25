import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";

/**
 * slug → the editable short offer summary (the DB override of the roster
 * default). Only rows that actually have a summary are returned; the caller
 * falls back to the roster's short default so a card is never blank.
 * Fail-soft: a read error must never take the roster down.
 */
export async function clientSummaries(): Promise<Record<string, string>> {
  try {
    const db = getDb();
    const rows = await db
      .select({ slug: clients.slug, summary: clients.summary })
      .from(clients)
      .where(eq(clients.status, "active"));
    return Object.fromEntries(
      rows.filter((r) => r.summary?.trim()).map((r) => [r.slug, r.summary as string]),
    );
  } catch {
    return {};
  }
}
