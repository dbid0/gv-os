"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { shellUser } from "@/lib/auth/user";
import { setPref } from "@/lib/prefs";

/** Profile fields ride on user_prefs — identity is the magic-link email. */
export async function saveProfile(raw: unknown) {
  const data = z
    .object({
      displayName: z.string().max(80),
      discordHandle: z.string().max(80),
    })
    .parse(raw);
  const user = await shellUser();
  await setPref(user?.email ?? null, "display-name", data.displayName.trim());
  await setPref(user?.email ?? null, "discord-handle", data.discordHandle.trim());
  revalidatePath("/profile");
  return { ok: true };
}
