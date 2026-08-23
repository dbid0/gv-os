"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { shellUser } from "@/lib/auth/user";
import { setPref } from "@/lib/prefs";

import { DASHBOARD_CARD_IDS } from "@/lib/dashboard-cards";

const input = z.array(z.enum(DASHBOARD_CARD_IDS)).max(12);

/** Persist the admin's dashboard layout (ordered card ids). */
export async function saveDashboardCards(raw: unknown) {
  const cards = input.parse(raw);
  const user = await shellUser();
  await setPref(user?.email ?? null, "dashboard-cards", cards);
  revalidatePath("/dashboard");
  return { ok: true };
}
