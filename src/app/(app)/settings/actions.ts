"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db/client";
import { settings } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { fromDollars } from "@/lib/money";
import { getSettings } from "@/lib/settings";

const input = z.object({
  monthlyRevenueGoal: z.string().optional(),
  showRateGoalPct: z.number().min(0).max(100).nullable().optional(),
  closeRateGoalPct: z.number().min(0).max(100).nullable().optional(),
  currency: z.string().min(1).optional(),
});

export async function updateSettings(raw: z.input<typeof input>) {
  if (!devAuthBypass()) {
    const user = await currentUser();
    if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  }
  const parsed = input.parse(raw);
  const current = await getSettings();

  const next = {
    monthlyRevenueGoalCents: parsed.monthlyRevenueGoal?.trim()
      ? fromDollars(parsed.monthlyRevenueGoal)
      : current.monthlyRevenueGoalCents,
    showRateGoalPct:
      parsed.showRateGoalPct === undefined
        ? current.showRateGoalPct
        : parsed.showRateGoalPct,
    closeRateGoalPct:
      parsed.closeRateGoalPct === undefined
        ? current.closeRateGoalPct
        : parsed.closeRateGoalPct,
    currency: parsed.currency ?? current.currency,
  };

  const db = getDb();
  await db
    .insert(settings)
    .values({ id: "org", data: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.id,
      set: { data: next, updatedAt: new Date() },
    });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
