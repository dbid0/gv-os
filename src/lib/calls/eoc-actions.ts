"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { bookings, reps } from "@/db/schema/app";
import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { currentUser } from "@/lib/auth/server";
import { callTimeFor, validateEoc, type EocFormInput } from "@/lib/calls/eoc-form";
import { fileEoc, restoreEoc, voidEoc } from "@/lib/calls/eoc-store";
import { getTeamBySlug } from "@/lib/sales/queries";

type Result = { ok: true; replayed?: boolean } | { ok: false; errors: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/;

/**
 * Filing, voiding and restoring an end-of-call report: any allowlisted member
 * of the team except a client login. A report is an ops record — it never
 * touches money — so the bar is the same as confirming a call, plus the
 * explicit refusal of the client role, which can see a workspace but must
 * never write its sales records.
 */
async function requireFiler(): Promise<string | null> {
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  if ((await resolveRealRole(user.email)) === "client") {
    throw new Error("Client logins can't file end-of-call reports.");
  }
  return user.email;
}

function revalidateCallSurfaces(slug: string) {
  revalidatePath(`/w/${slug}/crm`);
  revalidatePath(`/w/${slug}/sales`);
  revalidatePath(`/w/${slug}/calls`);
  revalidatePath(`/w/${slug}`);
}

export async function fileEocAction(
  slug: string,
  input: EocFormInput,
  bookingId: string | null,
  submissionKey: string,
): Promise<Result> {
  const email = await requireFiler();
  if (!SLUG.test(slug)) return { ok: false, errors: ["Unknown offer."] };
  if (!UUID.test(submissionKey)) {
    return { ok: false, errors: ["This form expired. Reopen it and try again."] };
  }
  if (bookingId !== null && !UUID.test(bookingId)) {
    return { ok: false, errors: ["That call no longer exists."] };
  }

  const team = await getTeamBySlug(slug);
  if (!team) return { ok: false, errors: ["This offer has no sales workspace yet."] };

  const db = getDb();
  const teamReps = await db
    .select({ id: reps.id })
    .from(reps)
    .where(eq(reps.clientId, team.id));
  const checked = validateEoc(input, new Set(teamReps.map((r) => r.id)));
  if (!checked.ok) return checked;

  let startsAt: Date | null = null;
  if (bookingId) {
    const [booking] = await db
      .select({ startsAt: bookings.startsAt, clientId: bookings.clientId })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!booking || booking.clientId !== team.id) {
      return { ok: false, errors: ["That call isn't on this offer's calendar."] };
    }
    startsAt = booking.startsAt;
  }

  const result = await fileEoc({
    clientId: team.id,
    bookingId,
    eoc: checked.eoc,
    callAt: callTimeFor(startsAt, new Date()),
    submissionKey,
    submittedBy: email,
  });
  if (!result.ok) {
    return {
      ok: false,
      errors: [
        result.reason === "booking_has_report"
          ? "This call already has an outcome filed. Void that report first if it was wrong."
          : "That call isn't on this offer's calendar.",
      ],
    };
  }
  revalidateCallSurfaces(slug);
  return { ok: true, replayed: result.replayed };
}

export async function voidEocAction(slug: string, reportId: string): Promise<Result> {
  const email = await requireFiler();
  const team = SLUG.test(slug) ? await getTeamBySlug(slug) : null;
  if (!team || !UUID.test(reportId)) {
    return { ok: false, errors: ["That report no longer exists."] };
  }
  const done = await voidEoc(team.id, reportId, email);
  if (!done) return { ok: false, errors: ["That report is already voided or gone."] };
  revalidateCallSurfaces(slug);
  return { ok: true };
}

export async function restoreEocAction(
  slug: string,
  reportId: string,
): Promise<Result> {
  await requireFiler();
  const team = SLUG.test(slug) ? await getTeamBySlug(slug) : null;
  if (!team || !UUID.test(reportId)) {
    return { ok: false, errors: ["That report no longer exists."] };
  }
  const res = await restoreEoc(team.id, reportId);
  if (!res.ok) {
    return {
      ok: false,
      errors: [
        res.reason === "booking_has_report"
          ? "That call has a newer report. Void it first to bring this one back."
          : "That report no longer exists.",
      ],
    };
  }
  revalidateCallSurfaces(slug);
  return { ok: true };
}
