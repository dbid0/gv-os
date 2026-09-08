import "server-only";

import { randomBytes } from "node:crypto";

import { getDb } from "@/db/client";
import { integrations } from "@/db/schema/app";
import { seal, secretHint } from "@/lib/crypto/secretbox";
import { providerByValue, providerSupportsMethod } from "@/lib/integrations/providers";
import { syncProviderNow } from "@/lib/integrations/sync-on-connect";
import { serverEnv } from "@/env.server";

/**
 * The ONE sealed path a credential enters the vault by.
 *
 * Two doors call it — the Settings form (session auth) and the operator API
 * (SYNC_SECRET auth) — because the credentials key exists only in this
 * environment, so sealing can only happen here. Auth belongs to the doors;
 * this core takes already-authorized input, seals before insert, and never
 * returns or logs plaintext.
 */
export interface ConnectInput {
  provider: string;
  label: string;
  method: "api_key" | "webhook" | "manual";
  secret?: string | null;
  reference?: string | null;
  clientId?: string | null;
}

export async function connectIntegrationCore(input: ConnectInput) {
  const provider = providerByValue(input.provider);
  if (!provider) throw new Error("Unknown provider.");
  if (!providerSupportsMethod(provider, input.method)) {
    throw new Error(`${provider.label} can't be connected by ${input.method}.`);
  }
  const db = getDb();

  const config: Record<string, unknown> = { method: input.method };
  let secretBox: string | null = null;
  let hint: string | null = null;

  if (input.method === "api_key") {
    const secret = input.secret?.trim();
    if (!secret) throw new Error("Paste the credential.");
    const key = serverEnv().CREDENTIALS_KEY;
    if (!key) {
      throw new Error(
        "CREDENTIALS_KEY is not set in this environment — cannot store credentials.",
      );
    }
    secretBox = seal(secret, key);
    hint = secretHint(secret);
  } else if (input.method === "webhook") {
    // The minted URL is the credential the tool posts to.
    config.webhook_token = randomBytes(24).toString("hex");
  } else {
    const reference = input.reference?.trim();
    if (reference) config.reference = reference;
  }

  const [row] = await db
    .insert(integrations)
    .values({
      provider: input.provider,
      label: input.label.trim(),
      clientId: input.clientId ?? null,
      secretBox,
      secretHint: hint,
      config,
      status: "connected",
    })
    .returning({ id: integrations.id, secretHint: integrations.secretHint });

  // Pull the provider's data immediately (api_key connections only — a
  // webhook has nothing to pull yet, and manual is off-platform). Fail-soft:
  // a bad key never breaks the connect; the scheduled job keeps it fresh.
  if (input.method === "api_key") {
    await syncProviderNow(input.provider);
  }

  return row;
}
