import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { getDb } from "@/db/client";
import { actionItems, clients, meetingNotes, teamMembers } from "@/db/schema/app";
import { planTasks, type ClientRef, type RosterMember } from "@/lib/meetings/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The cloud notetaker's landing zone. A GitHub Action records the call,
 * transcribes it, distills it with Claude Code, and POSTs the result here with
 * `Authorization: Bearer ${SYNC_SECRET}` — the same shared secret the sync cron
 * uses. Never the browser; this writes tasks, so it is machine-to-machine.
 *
 * Idempotent on `sourceRef` (the recorder's session stamp): a re-post updates
 * the recap in place and does NOT re-create tasks, so a retried Action can't
 * double the Work board.
 */
async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.SYNC_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  const user = await currentUser();
  return Boolean(user?.email && isAllowed(user.email));
}

const bodySchema = z.object({
  title: z.string().min(1).max(300),
  source: z.enum(["agency_call", "client_call", "manual"]).default("agency_call"),
  sourceRef: z.string().max(200).optional(),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary: z.string().max(20000).optional(),
  transcript: z.string().max(500000).optional(),
  attendees: z.array(z.string().max(120)).default([]),
  docLink: z.string().url().max(2000).optional(),
  /** Scope the whole call to one client (an ad-hoc client call). */
  clientSlug: z.string().max(120).optional(),
  actionItems: z
    .array(
      z.object({
        person: z.string().max(120),
        tasks: z.array(z.string().max(300)).default([]),
      }),
    )
    .default([]),
});

/** "The Grid" -> ["Grid", "The Grid"]; "Racks Closes" -> ["Racks", ...]. */
function aliasesFor(name: string): string[] {
  const out = new Set<string>([name]);
  const noArticle = name.replace(/^the\s+/i, "").trim();
  if (noArticle && noArticle !== name) out.add(noArticle);
  const first = noArticle.split(/\s+/)[0];
  if (first && first.length >= 3) out.add(first);
  return [...out];
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bad request." },
      { status: 400 },
    );
  }

  const db = getDb();

  // Roster + client references for resolving owners and per-task client scope.
  const [members, clientRows] = await Promise.all([
    db
      .select({ id: teamMembers.id, name: teamMembers.name })
      .from(teamMembers)
      .where(eq(teamMembers.status, "active")),
    db
      .select({ id: clients.id, name: clients.name, slug: clients.slug })
      .from(clients)
      .where(eq(clients.status, "active")),
  ]);

  const roster: RosterMember[] = members;
  const clientRefs: ClientRef[] = clientRows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    aliases: aliasesFor(c.name),
  }));

  // A whole-call client scope, when the notetaker names one.
  const meetingClientId = input.clientSlug
    ? (clientRows.find((c) => c.slug === input.clientSlug)?.id ?? null)
    : null;

  // Idempotency: has this exact session already landed?
  const existing = input.sourceRef
    ? await db
        .select({ id: meetingNotes.id })
        .from(meetingNotes)
        .where(eq(meetingNotes.sourceRef, input.sourceRef))
        .limit(1)
    : [];

  const meetingValues = {
    title: input.title,
    source: input.source,
    sourceRef: input.sourceRef ?? null,
    meetingDate: input.meetingDate,
    summary: input.summary ?? null,
    transcript: input.transcript ?? null,
    attendees: input.attendees,
    actionItems: input.actionItems,
    docLink: input.docLink ?? null,
    clientId: meetingClientId,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    // Re-post of the same call: refresh the recap, leave tasks untouched.
    await db
      .update(meetingNotes)
      .set(meetingValues)
      .where(eq(meetingNotes.id, existing[0].id));
    return NextResponse.json({
      ok: true,
      meetingId: existing[0].id,
      updated: true,
      tasksCreated: 0,
    });
  }

  const [meeting] = await db
    .insert(meetingNotes)
    .values(meetingValues)
    .returning({ id: meetingNotes.id });

  // Fan the distilled items onto the Work board. A call-level client scope wins;
  // otherwise each task keeps the client its own text names (or agency null).
  const planned = planTasks(input.actionItems, roster, clientRefs);
  let tasksCreated = 0;
  if (planned.length > 0) {
    const rows = planned.map((p) => ({
      title: p.title,
      cadence: "daily",
      status: "not_started",
      assigneeId: p.assigneeId,
      // Keep the spoken name as free-text when it didn't resolve to a member,
      // so an unmatched task still shows who it's for.
      assignee: p.assigneeId ? null : p.person || null,
      clientId: meetingClientId ?? p.clientId,
      notes: `From call: ${input.title}`,
    }));
    await db.insert(actionItems).values(rows);
    tasksCreated = rows.length;
  }

  return NextResponse.json({
    ok: true,
    meetingId: meeting.id,
    updated: false,
    tasksCreated,
  });
}
