"use server";

import { revalidatePath } from "next/cache";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { currentUser } from "@/lib/auth/server";
import { getTeamBySlug } from "@/lib/sales/queries";
import { mergeInbox, unmergeInbox } from "@/lib/tracking/identity-store";

type Result = { ok: true } | { ok: false; reason: string };

const SLUG = /^[a-z0-9-]{1,80}$/;

/**
 * Merging inboxes changes who counts as one person in the cash mix, students
 * and every lead view, so only an admin may do it — by real roster role.
 */
async function requireAdmin(): Promise<string | null> {
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  if ((await resolveRealRole(user.email)) !== "admin") {
    throw new Error("Only an admin can merge inboxes.");
  }
  return user.email;
}

function revalidateIdentity(slug: string) {
  revalidatePath(`/w/${slug}/leads`, "layout");
  revalidatePath(`/w/${slug}/pipeline`);
  revalidatePath(`/w/${slug}/students`);
  revalidatePath(`/w/${slug}`);
}

export async function mergeInboxAction(
  slug: string,
  canonical: string,
  alias: string,
): Promise<Result> {
  const by = await requireAdmin();
  const team = SLUG.test(slug) ? await getTeamBySlug(slug) : null;
  if (!team) return { ok: false, reason: "Unknown offer." };
  const res = await mergeInbox({ clientId: team.id, alias, canonical, createdBy: by });
  if (res.ok) revalidateIdentity(slug);
  return res;
}

export async function unmergeInboxAction(slug: string, alias: string): Promise<Result> {
  await requireAdmin();
  const team = SLUG.test(slug) ? await getTeamBySlug(slug) : null;
  if (!team) return { ok: false, reason: "Unknown offer." };
  const res = await unmergeInbox(team.id, alias);
  if (res.ok) revalidateIdentity(slug);
  return res;
}
