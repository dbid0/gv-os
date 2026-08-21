import "server-only";

import type { NextRequest } from "next/server";

/**
 * Auth for the Discord bot's task API. BOT_API_TOKEN is the bot's own
 * credential — deliberately separate from SYNC_SECRET so a leaked bot token
 * can only touch tasks, never money syncs. Unset token = the API is off.
 */
export function botAuthorized(req: NextRequest): boolean {
  const token = process.env.BOT_API_TOKEN;
  return Boolean(token) && req.headers.get("authorization") === `Bearer ${token}`;
}
