"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { currentUser } from "@/lib/auth/server";
import { CLAIM_ROLES } from "@/lib/payments/claims";
import {
  linkRefund,
  unlinkRefund,
  unwaiveClawback,
  waiveClawback,
} from "@/lib/payments/clawbacks-store";

type Result = { ok: boolean; reason?: string };

/**
 * Linking refunds and waiving clawbacks changes what reps are owed, so only an
 * admin may do it — checked against the real roster role, not only the route.
 */
async function requireAdmin(): Promise<string | null> {
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  if ((await resolveRealRole(user.email)) !== "admin") {
    throw new Error("Only an admin can change clawbacks.");
  }
  return user.email;
}

const done = (res: { ok: true } | { ok: false; reason: string }): Result => {
  revalidatePath("/accounting/payments");
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
};

const linkInput = z.object({
  refundEventId: z.string().uuid(),
  chargeEventId: z.string().uuid(),
});

export async function linkRefundAction(
  input: z.infer<typeof linkInput>,
): Promise<Result> {
  const by = await requireAdmin();
  const parsed = linkInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, reason: "Pick the charge this refund reverses." };
  return done(
    await linkRefund(parsed.data.refundEventId, parsed.data.chargeEventId, by),
  );
}

export async function unlinkRefundAction(refundEventId: string): Promise<Result> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(refundEventId).success) {
    return { ok: false, reason: "That refund no longer exists." };
  }
  return done(await unlinkRefund(refundEventId));
}

const waiveInput = z.object({
  refundEventId: z.string().uuid(),
  role: z.enum(CLAIM_ROLES),
  reason: z.string(),
});

export async function waiveClawbackAction(input: {
  refundEventId: string;
  role: string;
  reason: string;
}): Promise<Result> {
  const by = await requireAdmin();
  const parsed = waiveInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "That clawback no longer exists." };
  return done(await waiveClawback({ ...parsed.data, waivedBy: by }));
}

export async function unwaiveClawbackAction(input: {
  refundEventId: string;
  role: string;
}): Promise<Result> {
  await requireAdmin();
  const parsed = waiveInput.omit({ reason: true }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "That waiver no longer exists." };
  return done(await unwaiveClawback(parsed.data.refundEventId, parsed.data.role));
}
