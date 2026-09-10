import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { paymentEmailAliases } from "@/db/schema/app";
import { buildAliasMap, type AliasMap } from "@/lib/tracking/aliases";

/** The client's alias map, ready for identity joins. */
export async function aliasMapForClient(clientId: string): Promise<AliasMap> {
  const db = getDb();
  const rows = await db
    .select({
      aliasEmail: paymentEmailAliases.aliasEmail,
      canonicalEmail: paymentEmailAliases.canonicalEmail,
    })
    .from(paymentEmailAliases)
    .where(eq(paymentEmailAliases.clientId, clientId));
  return buildAliasMap(rows);
}
