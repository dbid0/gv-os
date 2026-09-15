"use server";

import { revalidatePath } from "next/cache";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { currentUser } from "@/lib/auth/server";
import { validateExclusionReason } from "@/lib/bookings/exclusion-reason";
import { excludeBooking, restoreBooking } from "@/lib/bookings/exclusions-store";
import { getTeamBySlug } from "@/lib/sales/queries";

type Result = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Taking a call out of the rates changes the numbers: admins only, by real role. */
async function requireAdmin(): Promise<string | null> {
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  if ((await resolveRealRole(user.email)) !== "admin") {
    throw new Error("Only an admin can take a call out of the numbers.");
  }
  return user.email;
}

function revalidateNumbers(slug: string) {
  revalidatePath(`/w/${slug}/calls`);
  revalidatePath(`/w/${slug}/crm`);
  revalidatePath(`/w/${slug}/sales`);
  revalidatePath(`/w/${slug}/sources`);
  revalidatePath(`/w/${slug}`);
}

export async function excludeBookingAction(
  slug: string,
  bookingId: string,
  rawReason: string,
): Promise<Result> {
  const by = await requireAdmin();
  const team = /^[a-z0-9-]{1,80}$/.test(slug) ? await getTeamBySlug(slug) : null;
  if (!team || !UUID.test(bookingId)) return { ok: false, error: "That call is gone." };
  const reason = validateExclusionReason(rawReason);
  if (!reason.ok) return reason;
  const res = await excludeBooking(team.id, bookingId, reason.reason, by);
  if (!res.ok) return { ok: false, error: "That call isn't on this offer's calendar." };
  revalidateNumbers(slug);
  return { ok: true };
}

export async function restoreBookingAction(
  slug: string,
  bookingId: string,
): Promise<Result> {
  await requireAdmin();
  const team = /^[a-z0-9-]{1,80}$/.test(slug) ? await getTeamBySlug(slug) : null;
  if (!team || !UUID.test(bookingId)) return { ok: false, error: "That call is gone." };
  if (!(await restoreBooking(team.id, bookingId))) {
    return { ok: false, error: "That call is already back in the numbers." };
  }
  revalidateNumbers(slug);
  return { ok: true };
}
