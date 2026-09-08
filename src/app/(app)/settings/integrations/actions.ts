"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { integrations } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { connectIntegrationCore } from "@/lib/integrations/connect";
import { PROVIDER_VALUES } from "@/lib/integrations/providers";
import { syncProviderNow } from "@/lib/integrations/sync-on-connect";
import { serverEnv } from "@/env.server";

async function requireUser() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
}

function requireKey(): string {
  const key = serverEnv().CREDENTIALS_KEY;
  if (!key) {
    throw new Error(
      "CREDENTIALS_KEY is not set in this environment — cannot store credentials.",
    );
  }
  return key;
}

const connectInput = z.object({
  provider: z.enum(PROVIDER_VALUES),
  label: z.string().min(1, "Give the connection a label."),
  /** How the tool connects. Not every tool is an API key. */
  method: z.enum(["api_key", "webhook", "manual"]).default("api_key"),
  /** Required only for the api_key method. */
  secret: z.string().optional(),
  /** Optional URL/note for the manual method. */
  reference: z.string().optional(),
  clientId: z.string().uuid().nullable().optional(),
});

/**
 * Stores a connection using one of three methods:
 *  - api_key: a secret is sealed BEFORE the insert; only its hint is returned.
 *  - webhook: no secret — a capability-URL token is minted and the address IS
 *    the credential the tool posts to.
 *  - manual: no secret — the tool is set up outside GV OS and tracked here,
 *    with an optional reference link.
 * The plaintext of any key never leaves this module.
 */
export async function connectIntegration(raw: z.input<typeof connectInput>) {
  await requireUser();
  const input = connectInput.parse(raw);
  const row = await connectIntegrationCore({
    provider: input.provider,
    label: input.label,
    method: input.method,
    secret: input.secret ?? null,
    reference: input.reference ?? null,
    clientId: input.clientId ?? null,
  });
  revalidatePath("/settings/integrations");
  return row;
}

/** Revokes a connection: the sealed secret is DELETED, the row kept as history. */
export async function revokeIntegration(id: string) {
  await requireUser();
  const integrationId = z.string().uuid().parse(id);
  const db = getDb();
  await db
    .update(integrations)
    .set({ secretBox: null, status: "revoked", updatedAt: new Date() })
    .where(eq(integrations.id, integrationId));
  revalidatePath("/settings/integrations");
  return { ok: true };
}

/** Removes a connection entirely (secret and row). */
export async function deleteIntegration(id: string) {
  await requireUser();
  const integrationId = z.string().uuid().parse(id);
  const db = getDb();
  await db.delete(integrations).where(eq(integrations.id, integrationId));
  revalidatePath("/settings/integrations");
  return { ok: true };
}
