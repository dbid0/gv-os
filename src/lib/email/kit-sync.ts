import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { integrations, kitSnapshots } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import {
  parseKitAccount,
  parseKitSequences,
  parseKitTagCount,
} from "@/lib/email/kit-parse";

/**
 * Kit account snapshot pull — one snapshot per connected `kit` integration
 * per run. Three GETs per account (account, sequences, tags), well under
 * Kit's write-side rate limits since everything here is a read.
 */

async function kitGet(apiKey: string, path: string): Promise<unknown> {
  const res = await fetch(`https://api.kit.com/v4${path}`, {
    headers: { "X-Kit-Api-Key": apiKey, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Kit ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function pullKitSnapshots(): Promise<
  { integrationId: string; sequences: number; tags: number }[]
> {
  const key = serverEnv().CREDENTIALS_KEY;
  if (!key) throw new Error("CREDENTIALS_KEY is not set — cannot open the vault.");
  const db = getDb();
  const connections = await db
    .select({
      id: integrations.id,
      clientId: integrations.clientId,
      secretBox: integrations.secretBox,
    })
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "kit"),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    );

  const results = [];
  for (const conn of connections) {
    const apiKey = open(conn.secretBox as string, key);
    const [account, sequencesBody, tagsBody] = await Promise.all([
      kitGet(apiKey, "/account"),
      kitGet(apiKey, "/sequences?per_page=500"),
      kitGet(apiKey, "/tags?per_page=500"),
    ]);
    const parsedAccount = parseKitAccount(account);
    const sequences = parseKitSequences(sequencesBody);
    const tagCount = parseKitTagCount(tagsBody);

    await db.insert(kitSnapshots).values({
      integrationId: conn.id,
      clientId: conn.clientId,
      accountName: parsedAccount.name,
      plan: parsedAccount.plan,
      sequenceCount: sequences.length,
      tagCount,
      sequences,
    });
    await db
      .update(integrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncNote: `${sequences.length} sequences, ${tagCount} tags${parsedAccount.plan ? ` (${parsedAccount.plan})` : ""}`,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, conn.id));
    results.push({
      integrationId: conn.id,
      sequences: sequences.length,
      tags: tagCount,
    });
  }
  return results;
}
