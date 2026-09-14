"use server";

import { revalidatePath } from "next/cache";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { currentUser } from "@/lib/auth/server";
import { getTeamBySlug } from "@/lib/sales/queries";
import { validateTagRule, type TagRuleInput } from "@/lib/tracking/tag-rules";
import {
  createTagRule,
  deleteTagRule,
  setTagRuleActive,
  updateTagRule,
} from "@/lib/tracking/tag-rules-store";

type Result = { ok: true } | { ok: false; errors: string[] };

/**
 * Tag rules change what an offer's dashboards count, so only an admin may write
 * them — checked against the REAL roster role here, not only the route guard.
 */
async function requireUser(): Promise<string | null> {
  // Dev/preview bypass only — never passes in production.
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  if ((await resolveRealRole(user.email)) !== "admin") {
    throw new Error("Only an admin can change payment tag rules.");
  }
  return user.email;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function clientIdFor(slug: string): Promise<string | null> {
  const team = await getTeamBySlug(slug);
  return team?.id ?? null;
}

/** Every surface that reads the rules — the setup preview and the dashboards. */
function revalidateRuleSurfaces(slug: string) {
  revalidatePath(`/clients/${slug}/setup`);
  revalidatePath(`/w/${slug}`);
  revalidatePath("/dashboard");
}

/** Create a rule (no ruleId) or replace one (ruleId). */
export async function saveTagRuleAction(
  slug: string,
  input: TagRuleInput,
  ruleId?: string,
): Promise<Result> {
  const email = await requireUser();
  const clientId = await clientIdFor(slug);
  if (!clientId) {
    return { ok: false, errors: ["This offer has no sales workspace yet."] };
  }
  const checked = validateTagRule(input);
  if (!checked.ok) return checked;
  try {
    if (ruleId) {
      if (!UUID.test(ruleId))
        return { ok: false, errors: ["That rule no longer exists."] };
      const updated = await updateTagRule(clientId, ruleId, checked.rule);
      if (!updated) return { ok: false, errors: ["That rule no longer exists."] };
    } else {
      await createTagRule(clientId, checked.rule, email);
    }
  } catch {
    return { ok: false, errors: ["Could not save the rule. Nothing was changed."] };
  }
  revalidateRuleSurfaces(slug);
  return { ok: true };
}

export async function toggleTagRuleAction(
  slug: string,
  ruleId: string,
  active: boolean,
): Promise<Result> {
  await requireUser();
  const clientId = await clientIdFor(slug);
  if (!clientId || !UUID.test(ruleId)) {
    return { ok: false, errors: ["That rule no longer exists."] };
  }
  const done = await setTagRuleActive(clientId, ruleId, active);
  if (!done) return { ok: false, errors: ["That rule no longer exists."] };
  revalidateRuleSurfaces(slug);
  return { ok: true };
}

export async function deleteTagRuleAction(
  slug: string,
  ruleId: string,
): Promise<Result> {
  await requireUser();
  const clientId = await clientIdFor(slug);
  if (!clientId || !UUID.test(ruleId)) {
    return { ok: false, errors: ["That rule no longer exists."] };
  }
  const done = await deleteTagRule(clientId, ruleId);
  if (!done) return { ok: false, errors: ["That rule no longer exists."] };
  revalidateRuleSurfaces(slug);
  return { ok: true };
}
