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

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,/;
const MAX_AVATAR_BYTES = 200_000;

/** Store the downscaled avatar. Small by construction; rejected if not. */
export async function saveAvatar(dataUrl: unknown) {
  const value = z.string().parse(dataUrl);
  if (!DATA_URL.test(value)) throw new Error("Not an image.");
  if (value.length > MAX_AVATAR_BYTES) {
    throw new Error("That image is too large even after resizing.");
  }
  const user = await shellUser();
  await setPref(user?.email ?? null, "avatar", value);
  revalidatePath("/profile");
  return { ok: true };
}
