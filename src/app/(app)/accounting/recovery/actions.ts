"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { viewerIsAdmin } from "@/lib/auth/viewer";
import { RECOVERY_DISPOSITIONS } from "@/lib/payments/recovery";
import { setRecoveryDisposition } from "@/lib/payments/recovery-store";

/**
 * The recovery inbox is GV-internal agency ops — admin only. This gate is the
 * real boundary (the page's own check only hides chrome), so it re-verifies
 * here rather than trusting the surface that called it.
 */
async function requireAdmin() {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  if (!(await viewerIsAdmin())) throw new Error("Not authorized.");
}

// A disposition, or the empty string meaning "clear back to open".
const input = z.object({
  paymentEventId: z.string().uuid(),
  disposition: z.union([z.enum(RECOVERY_DISPOSITIONS), z.literal("")]),
});

export async function setRecoveryStatusAction(
  raw: z.infer<typeof input>,
): Promise<{ ok: boolean; reason?: string }> {
  await requireAdmin();
  const parsed = input.parse(raw);
  const result = await setRecoveryDisposition(
    parsed.paymentEventId,
    parsed.disposition === "" ? null : parsed.disposition,
  );
  revalidatePath("/accounting/recovery");
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
