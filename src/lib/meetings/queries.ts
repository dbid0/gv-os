import "server-only";

import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, meetingNotes } from "@/db/schema/app";

export interface MeetingSummary {
  id: string;
  title: string;
  source: string;
  meetingDate: string;
  summary: string | null;
  attendees: string[];
  actionItems: { person: string; tasks: string[] }[];
  taskCount: number;
  docLink: string | null;
  clientId: string | null;
  clientName: string | null;
  clientSlug: string | null;
  hasTranscript: boolean;
}

export interface MeetingDetail extends MeetingSummary {
  transcript: string | null;
}

function taskCount(items: { tasks?: string[] }[] | null): number {
  return (items ?? []).reduce((n, it) => n + (it.tasks?.length ?? 0), 0);
}

/** Every recorded call, newest first, shaped for the Meetings list. */
export async function listMeetings(limit = 100): Promise<MeetingSummary[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: meetingNotes.id,
        title: meetingNotes.title,
        source: meetingNotes.source,
        meetingDate: meetingNotes.meetingDate,
        summary: meetingNotes.summary,
        attendees: meetingNotes.attendees,
        actionItems: meetingNotes.actionItems,
        docLink: meetingNotes.docLink,
        transcript: meetingNotes.transcript,
        clientId: meetingNotes.clientId,
        clientName: clients.name,
        clientSlug: clients.slug,
      })
      .from(meetingNotes)
      .leftJoin(clients, eq(meetingNotes.clientId, clients.id))
      .orderBy(desc(meetingNotes.meetingDate), desc(meetingNotes.createdAt))
      .limit(limit);
    return rows.map(({ transcript, ...r }) => ({
      ...r,
      attendees: r.attendees ?? [],
      actionItems: r.actionItems ?? [],
      taskCount: taskCount(r.actionItems),
      hasTranscript: Boolean(transcript && transcript.trim()),
    }));
  } catch {
    return [];
  }
}

/** One call with its full transcript, for the detail page. */
export async function getMeeting(id: string): Promise<MeetingDetail | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        id: meetingNotes.id,
        title: meetingNotes.title,
        source: meetingNotes.source,
        meetingDate: meetingNotes.meetingDate,
        summary: meetingNotes.summary,
        attendees: meetingNotes.attendees,
        actionItems: meetingNotes.actionItems,
        docLink: meetingNotes.docLink,
        transcript: meetingNotes.transcript,
        clientId: meetingNotes.clientId,
        clientName: clients.name,
        clientSlug: clients.slug,
      })
      .from(meetingNotes)
      .leftJoin(clients, eq(meetingNotes.clientId, clients.id))
      .where(eq(meetingNotes.id, id))
      .limit(1);
    if (!row) return null;
    return {
      ...row,
      attendees: row.attendees ?? [],
      actionItems: row.actionItems ?? [],
      taskCount: taskCount(row.actionItems),
      hasTranscript: Boolean(row.transcript && row.transcript.trim()),
    };
  } catch {
    return null;
  }
}
