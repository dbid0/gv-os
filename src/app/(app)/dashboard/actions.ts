"use server";

import { revalidatePath } from "next/cache";

import { shellUser } from "@/lib/auth/user";
import { setPref } from "@/lib/prefs";
import { normalizeHomeMode } from "@/lib/transactions/homepage";

/** Persist the homepage big-number mode (v2 §4: survives sign-out). */
export async function setHomeMode(raw: unknown) {
  const mode = normalizeHomeMode(raw);
  const user = await shellUser();
  await setPref(user?.email ?? null, "home-mode", mode);
  revalidatePath("/dashboard");
  return { ok: true, mode };
}
