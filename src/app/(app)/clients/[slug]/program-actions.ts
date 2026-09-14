"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { offerSettings } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { currentUser } from "@/lib/auth/server";
import { getTeamBySlug } from "@/lib/sales/queries";
import { validateProgram, type ProgramInput } from "@/lib/students/program";

type Result = { ok: true } | { ok: false; errors: string[] };

/** Who counts as a student is offer configuration: admins only, by real role. */
async function requireAdmin() {
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  if ((await resolveRealRole(user.email)) !== "admin") {
    throw new Error("Only an admin can change the student program.");
  }
}

export async function saveStudentProgramAction(
  slug: string,
  input: ProgramInput,
): Promise<Result> {
  await requireAdmin();
  const team = /^[a-z0-9-]{1,80}$/.test(slug) ? await getTeamBySlug(slug) : null;
  if (!team) return { ok: false, errors: ["This offer has no sales workspace yet."] };
  const checked = validateProgram(input);
  if (!checked.ok) return checked;

  const values = {
    studentMinPaymentCents: checked.program.minPaymentCents,
    programLengthWeeks: checked.program.lengthWeeks,
  };
  const db = getDb();
  await db
    .insert(offerSettings)
    .values({ clientId: team.id, ...values })
    .onConflictDoUpdate({
      target: [offerSettings.clientId],
      set: { ...values, updatedAt: new Date() },
    });
  revalidatePath(`/clients/${slug}/setup`);
  revalidatePath(`/w/${slug}/students`);
  return { ok: true };
}
