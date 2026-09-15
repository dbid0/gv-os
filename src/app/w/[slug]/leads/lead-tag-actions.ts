"use server";

import { revalidatePath } from "next/cache";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { resolveRealRole } from "@/lib/auth/resolve-role";
import { currentUser } from "@/lib/auth/server";
import { getTeamBySlug } from "@/lib/sales/queries";
import { aliasMapForClient } from "@/lib/tracking/aliases-store";
import { inboxesFor } from "@/lib/tracking/identity";
import {
  addLeadTag,
  deleteLeadView,
  removeLeadTag,
  saveLeadView,
} from "@/lib/tracking/lead-tags-store";
import {
  isFiltered,
  leadFiltersQuery,
  normalizeTag,
  readLeadFilters,
  validateViewName,
} from "@/lib/tracking/lead-views";

type Result = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,80}$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

/**
 * Tags and saved views are the team's own ops labels: any allowlisted member
 * except a client login, which can see a workspace but never label its leads
 * (a tag like "slow-payer" is not something the client should be writing — or
 * reading, which is why the pages hide them in portal view too).
 */
async function requireTeamMember(): Promise<string | null> {
  if (devAuthBypass()) return null;
  const user = await currentUser();
  if (!user?.email || !isAllowed(user.email)) throw new Error("Not authorized.");
  if ((await resolveRealRole(user.email)) === "client") {
    throw new Error("Client logins can't tag leads or save views.");
  }
  return user.email;
}

async function teamFor(slug: string) {
  return SLUG.test(slug) ? getTeamBySlug(slug) : null;
}

function revalidateLeads(slug: string, email?: string) {
  revalidatePath(`/w/${slug}/leads`);
  if (email) revalidatePath(`/w/${slug}/leads/${encodeURIComponent(email)}`);
}

export async function addLeadTagAction(
  slug: string,
  leadEmail: string,
  rawTag: string,
): Promise<Result> {
  const by = await requireTeamMember();
  const team = await teamFor(slug);
  if (!team) return { ok: false, error: "Unknown offer." };
  const email = leadEmail.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: "That lead has no usable email." };
  const tag = normalizeTag(rawTag);
  if (!tag.ok) return tag;
  await addLeadTag(team.id, email, tag.tag, by);
  revalidateLeads(slug, leadEmail);
  return { ok: true };
}

export async function removeLeadTagAction(
  slug: string,
  leadEmail: string,
  rawTag: string,
): Promise<Result> {
  await requireTeamMember();
  const team = await teamFor(slug);
  if (!team) return { ok: false, error: "Unknown offer." };
  const tag = normalizeTag(rawTag);
  if (!tag.ok) return tag;
  const inboxes = inboxesFor(leadEmail, await aliasMapForClient(team.id));
  await removeLeadTag(team.id, inboxes, tag.tag);
  revalidateLeads(slug, leadEmail);
  return { ok: true };
}

export async function saveLeadViewAction(
  slug: string,
  rawName: string,
  rawQuery: string,
): Promise<Result> {
  const by = await requireTeamMember();
  const team = await teamFor(slug);
  if (!team) return { ok: false, error: "Unknown offer." };
  const name = validateViewName(rawName);
  if (!name.ok) return name;
  // Only filters the page understands survive into a view.
  const filters = readLeadFilters(
    Object.fromEntries(new URLSearchParams(rawQuery.slice(0, 1000))),
  );
  if (!isFiltered(filters)) {
    return { ok: false, error: "Pick at least one filter to save as a view." };
  }
  const saved = await saveLeadView(team.id, name.name, leadFiltersQuery(filters), by);
  if (!saved.ok) {
    return { ok: false, error: `There's already a view called “${name.name}”.` };
  }
  revalidateLeads(slug);
  return { ok: true };
}

export async function deleteLeadViewAction(slug: string, id: string): Promise<Result> {
  await requireTeamMember();
  const team = await teamFor(slug);
  if (!team || !UUID.test(id)) {
    return { ok: false, error: "That view no longer exists." };
  }
  const done = await deleteLeadView(team.id, id);
  if (!done) return { ok: false, error: "That view no longer exists." };
  revalidateLeads(slug);
  return { ok: true };
}
