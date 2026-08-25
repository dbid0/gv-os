import "server-only";

import { and, desc, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { integrations } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import type { DiscordMessage } from "@/lib/discord/embed";

/**
 * The agency Discord sync sender. The webhook URL lives SEALED in the
 * integrations vault under the `discord` provider (Settings → Integrations →
 * Discord), exactly like the Google credential — the plaintext never leaves
 * this module. Everything is manual/triggered; nothing here runs on a schedule.
 */

const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

/** Pull the sealed Discord webhook URL. Accepts a raw URL or `{ webhookUrl }`. */
export async function loadDiscordWebhookUrl(): Promise<string> {
  const key = serverEnv().CREDENTIALS_KEY;
  if (!key) throw new Error("CREDENTIALS_KEY is not set — cannot open the vault.");
  const db = getDb();
  const [row] = await db
    .select({ secretBox: integrations.secretBox })
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "discord"),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    )
    .orderBy(desc(integrations.createdAt))
    .limit(1);
  if (!row?.secretBox) {
    throw new Error(
      "No connected Discord credential. Add the agency channel's webhook URL under Settings → Integrations → Discord.",
    );
  }

  const plaintext = open(row.secretBox, key).trim();
  let url = plaintext;
  // Tolerate either a raw webhook URL or a small JSON blob holding one.
  if (plaintext.startsWith("{")) {
    try {
      const parsed = JSON.parse(plaintext) as { webhookUrl?: string; url?: string };
      url = (parsed.webhookUrl ?? parsed.url ?? "").trim();
    } catch {
      // fall through to the validation below
    }
  }
  if (!DISCORD_WEBHOOK_RE.test(url)) {
    throw new Error(
      "The sealed Discord credential is not a channel webhook URL (https://discord.com/api/webhooks/…).",
    );
  }
  return url;
}

/** POST a message to a Discord channel webhook. Throws on a non-2xx response. */
export async function postToDiscordWebhook(
  url: string,
  message: DiscordMessage,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Discord rejected the message (${res.status}). ${detail.slice(0, 200)}`.trim(),
    );
  }
}

/** Load the sealed agency webhook and post a message to it. */
export async function postToAgencyDiscord(message: DiscordMessage): Promise<void> {
  const url = await loadDiscordWebhookUrl();
  await postToDiscordWebhook(url, message);
}
