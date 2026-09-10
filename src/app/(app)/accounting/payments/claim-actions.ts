"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { CLAIM_ROLES } from "@/lib/payments/claims";
import { claimPayment, unclaimPayment } from "@/lib/payments/claims-store";

async function requireUser() {
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  return user;
}

const claimInput = z.object({
  paymentEventId: z.string().uuid(),
  role: z.enum(CLAIM_ROLES),
  repId: z.string().uuid(),
});

export async function claimPaymentAction(
  input: z.infer<typeof claimInput>,
): Promise<{ ok: boolean; reason?: string }> {
  const user = await requireUser();
  const parsed = claimInput.parse(input);
  const result = await claimPayment({
    paymentEventId: parsed.paymentEventId,
    role: parsed.role,
    repId: parsed.repId,
    rateOverrideBps: null,
    createdBy: user?.email ?? null,
  });
  revalidatePath("/accounting/payments");
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

const unclaimInput = z.object({
  paymentEventId: z.string().uuid(),
  role: z.enum(CLAIM_ROLES),
});

export async function unclaimPaymentAction(
  input: z.infer<typeof unclaimInput>,
): Promise<void> {
  await requireUser();
  const parsed = unclaimInput.parse(input);
  await unclaimPayment(parsed.paymentEventId, parsed.role);
  revalidatePath("/accounting/payments");
}
