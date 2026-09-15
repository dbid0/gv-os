"use server";

import { revalidatePath } from "next/cache";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { currentUser } from "@/lib/auth/server";
import { getTeamBySlug } from "@/lib/sales/queries";
import { validateStudentCall, type StudentCallInput } from "@/lib/students/calls";
import { logStudentCall, setStudentCallVoided } from "@/lib/students/calls-store";

type Result = { ok: true } | { ok: false; errors: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Logging a coaching call is fulfilment work: any allowlisted team member
 * except a client login, which can see its students but never writes their
 * delivery record.
 */
async function requireTeamMember(): Promise<string | null> {
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  if ((await resolveRealRole(user.email)) === "client") {
    throw new Error("Client logins can't log 1-on-1 calls.");
  }
  return user.email;
}

async function teamFor(slug: string) {
  return /^[a-z0-9-]{1,80}$/.test(slug) ? getTeamBySlug(slug) : null;
}

export async function logStudentCallAction(
  slug: string,
  input: StudentCallInput,
  submissionKey: string,
): Promise<Result> {
  const by = await requireTeamMember();
  const team = await teamFor(slug);
  if (!team) return { ok: false, errors: ["This offer has no sales workspace yet."] };
  if (!UUID.test(submissionKey)) {
    return { ok: false, errors: ["This form expired. Reopen it and try again."] };
  }
  const checked = validateStudentCall(input, new Date());
  if (!checked.ok) return checked;
  await logStudentCall({ clientId: team.id, call: checked.call, submissionKey, by });
  revalidatePath(`/w/${slug}/students`);
  return { ok: true };
}

export async function setStudentCallVoidedAction(
  slug: string,
  id: string,
  voided: boolean,
): Promise<Result> {
  const by = await requireTeamMember();
  const team = await teamFor(slug);
  if (!team || !UUID.test(id)) return { ok: false, errors: ["That call is gone."] };
  if (!(await setStudentCallVoided(team.id, id, voided, by))) {
    return {
      ok: false,
      errors: [
        voided ? "That call is already voided." : "That call is already active.",
      ],
    };
  }
  revalidatePath(`/w/${slug}/students`);
  return { ok: true };
}
