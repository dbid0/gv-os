"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import { integrations } from "@/db/schema/app";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { seal, secretHint } from "@/lib/crypto/secretbox";
import { PROVIDER_VALUES, providerByValue } from "@/lib/integrations/providers";
import { serverEnv } from "@/env.server";

async function requireUser() {
  // Build phase: auth is off (see middleware DISABLE_AUTH).
  if (process.env.DISABLE_AUTH === "true") return;
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
  secret: z.string().min(1, "Paste the credential."),
  clientId: z.string().uuid().nullable().optional(),
});

/**
 * Stores a connection. The credential is sealed BEFORE the insert and the
 * return value carries only the hint — the plaintext never leaves this module.
 */
export async function connectIntegration(raw: z.input<typeof connectInput>) {
  await requireUser();
  const input = connectInput.parse(raw);
  const key = requireKey();
  const db = getDb();
  // Payments and Bookings providers get a capability-URL webhook token at
  // connect time — the address IS the credential the source posts to.
  const group = providerByValue(input.provider)?.group;
  const config =
    group === "Payments" || group === "Bookings"
      ? { webhook_token: randomBytes(24).toString("hex") }
      : {};
  const [row] = await db
    .insert(integrations)
    .values({
      provider: input.provider,
      label: input.label.trim(),
      clientId: input.clientId ?? null,
      secretBox: seal(input.secret, key),
      secretHint: secretHint(input.secret),
      config,
      status: "connected",
    })
    .returning({ id: integrations.id, secretHint: integrations.secretHint });
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
