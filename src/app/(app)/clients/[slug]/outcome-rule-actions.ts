"use server";

import { revalidatePath } from "next/cache";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { currentUser } from "@/lib/auth/server";
import { validateOutcomeRule, type OutcomeRuleInput } from "@/lib/calls/outcome-rules";
import { createOutcomeRule, deleteOutcomeRule } from "@/lib/calls/outcome-rules-store";
import { getTeamBySlug } from "@/lib/sales/queries";

type Result = { ok: true } | { ok: false; errors: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a filed outcome sets off is offer configuration: admins only, by real role. */
async function requireAdmin(): Promise<string | null> {
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  if ((await resolveRealRole(user.email)) !== "admin") {
    throw new Error("Only an admin can change call outcome rules.");
  }
  return user.email;
}

async function teamFor(slug: string) {
  return /^[a-z0-9-]{1,80}$/.test(slug) ? getTeamBySlug(slug) : null;
}

export async function createOutcomeRuleAction(
  slug: string,
  input: OutcomeRuleInput,
): Promise<Result> {
  const by = await requireAdmin();
  const team = await teamFor(slug);
  if (!team) return { ok: false, errors: ["This offer has no sales workspace yet."] };
  const checked = validateOutcomeRule(input);
  if (!checked.ok) return checked;
  const created = await createOutcomeRule(team.id, checked.rule, by);
  if (!created.ok) {
    return {
      ok: false,
      errors: [
        checked.rule.tag
          ? `That outcome already has a rule tagging ${checked.rule.tag}.`
          : "That outcome already has a rule without a tag.",
      ],
    };
  }
  revalidatePath(`/clients/${slug}/setup`);
  return { ok: true };
}

export async function deleteOutcomeRuleAction(
  slug: string,
  id: string,
): Promise<Result> {
  await requireAdmin();
  const team = await teamFor(slug);
  if (!team || !UUID.test(id)) {
    return { ok: false, errors: ["That rule is already gone."] };
  }
  if (!(await deleteOutcomeRule(team.id, id))) {
    return { ok: false, errors: ["That rule is already gone."] };
  }
  revalidatePath(`/clients/${slug}/setup`);
  return { ok: true };
}
