import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { aiConversations, type AiConversation } from "@/db/schema/app";
import { type AiRole } from "@/lib/ai/roles";

/**
 * The assistant transcript store — append-only in spirit.
 *
 * One row per message. Turns are inserted, never mutated: a conversation is the
 * ordered list of its rows. History is scoped to (profile, face) so each face
 * keeps its own thread and a rep never reads an admin's transcript.
 */

export type MessageRole = "user" | "assistant";

export interface SaveTurnInput {
  profileId: string | null;
  face: AiRole;
  role: MessageRole;
  content: string;
  questionId?: string | null;
  toolCalls?: { toolId: string; capability: string }[] | null;
  toolResults?: Record<string, unknown> | null;
}

/** A transcript message shaped for the panel. */
export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  questionId: string | null;
  toolCalls: { toolId: string; capability: string }[] | null;
  toolResults: Record<string, unknown> | null;
  createdAt: Date;
}

function toMessage(row: AiConversation): ConversationMessage {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    questionId: row.questionId,
    toolCalls: row.toolCalls ?? null,
    toolResults: row.toolResults ?? null,
    createdAt: row.createdAt,
  };
}

export async function saveTurn(input: SaveTurnInput): Promise<void> {
  const db = getDb();
  await db.insert(aiConversations).values({
    profileId: input.profileId,
    face: input.face,
    role: input.role,
    content: input.content,
    questionId: input.questionId ?? null,
    toolCalls: input.toolCalls ?? null,
    toolResults: input.toolResults ?? null,
  });
}

/**
 * The most recent messages for a (profile, face) thread, oldest-first so the
 * panel can render top-to-bottom. `profileId` null matches the anonymous
 * dev/preview thread.
 */
export async function recentConversation(
  profileId: string | null,
  face: AiRole,
  limit = 20,
): Promise<ConversationMessage[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.face, face),
        profileId
          ? eq(aiConversations.profileId, profileId)
          : isNull(aiConversations.profileId),
      ),
    )
    .orderBy(desc(aiConversations.createdAt))
    .limit(limit);
  return rows.reverse().map(toMessage);
}
