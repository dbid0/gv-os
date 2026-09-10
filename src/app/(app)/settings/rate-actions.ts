"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { saveClientRates } from "@/lib/payments/rates-store";

async function requireUser() {
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  return user;
}

// Percent with up to 2 decimals, 0–100, or empty to clear. Stored as bps.
const pct = z
  .string()
  .trim()
  .transform((v) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new Error("Rates are percentages between 0 and 100.");
    }
    return Math.round(n * 100);
  });

const input = z.object({
  clientId: z.string().uuid(),
  setter: pct,
  closer: pct,
  dm_setter: pct,
});

export async function saveRatesAction(raw: {
  clientId: string;
  setter: string;
  closer: string;
  dm_setter: string;
}): Promise<{ ok: boolean; reason?: string }> {
  await requireUser();
  try {
    const parsed = input.parse(raw);
    await saveClientRates(parsed.clientId, {
      setter: parsed.setter,
      closer: parsed.closer,
      dm_setter: parsed.dm_setter,
    });
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Could not save." };
  }
  revalidatePath("/settings");
  revalidatePath("/accounting/payments");
  return { ok: true };
}
