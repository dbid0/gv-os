import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients } from "@/db/schema/app";

/** slug → logo data URL for active clients. Fail-soft: shell must render. */
export async function clientLogos(): Promise<Record<string, string>> {
  try {
    const db = getDb();
    const rows = await db
      .select({ slug: clients.slug, logo: clients.logo })
      .from(clients)
      .where(eq(clients.status, "active"));
    return Object.fromEntries(
      rows.filter((r) => r.logo).map((r) => [r.slug, r.logo as string]),
    );
  } catch {
    return {};
  }
}
