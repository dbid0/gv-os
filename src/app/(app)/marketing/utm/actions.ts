"use server";

import { revalidatePath } from "next/cache";

import { shortUrl } from "@/lib/marketing/short-link";
import { z } from "zod";

import { isAllowed } from "@/lib/auth/allowlist";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { currentUser } from "@/lib/auth/server";
import { describeBuildFailure } from "@/lib/marketing/utm";
import { createUtmLink, type UtmLinkRow } from "@/lib/marketing/utm-links";

/**
 * The UTM builder is agency tooling — every non-admin role is already
 * denied this route by the middleware (it's absent from every role's route
 * grants in lib/auth/roles.ts), and this is the defense-in-depth layer for
 * the server action itself, matching the pattern other admin-only (app)
 * surfaces use (see settings/discord-actions.ts).
 */
async function requireAdmin(): Promise<string | null> {
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  return user.email;
}

const input = z.object({
  clientId: z.string().uuid(),
  destinationUrl: z.string().min(1).max(2000),
  source: z.string().min(1).max(200),
  medium: z.string().min(1).max(200),
  campaign: z.string().min(1).max(200),
  content: z.string().min(1).max(200),
});

export type GenerateUtmLinkResult =
  { ok: true; row: UtmLinkRow; shortUrl: string | null } | { ok: false; error: string };

/**
 * Generates a UTM'd link and writes it into the registry in the same call —
 * there is no separate "save" step. A malformed destination or a field that
 * normalizes to nothing fails closed with a specific reason instead of
 * silently producing a broken or blank-tagged link.
 */
export async function generateUtmLink(raw: unknown): Promise<GenerateUtmLinkResult> {
  const email = await requireAdmin();
  const data = input.parse(raw);

  const result = await createUtmLink({ ...data, createdBy: email });
  if (!result.ok) return { ok: false, error: describeBuildFailure(result) };

  revalidatePath("/marketing/utm");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return {
    ok: true,
    row: result.row,
    shortUrl:
      result.row.shortCode && origin ? shortUrl(origin, result.row.shortCode) : null,
  };
}
