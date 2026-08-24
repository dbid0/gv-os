"use server";

import { z } from "zod";

import { devAuthBypass } from "@/lib/auth/dev-bypass";
import { isAllowed } from "@/lib/auth/allowlist";
import { currentUser } from "@/lib/auth/server";
import { answer } from "@/lib/ai/answer-service";
import { resolveAiViewer } from "@/lib/ai/context";
import { saveTurn } from "@/lib/ai/conversations";
import { STARTER_QUESTIONS } from "@/lib/ai/starter-questions";
import { toolById } from "@/lib/ai/tools";
import { type AiAnswer } from "@/lib/ai/types";

/**
 * The assistant's one write path.
 *
 * A Server Action re-checks the allowlist (the route is already gated; THIS is
 * the gate that matters), resolves the viewer's face + scope, computes an
 * answer against the live read layers, and appends both the user turn and the
 * assistant reply to the transcript. Scope is never widened here — the answer
 * service refuses any tool the viewer's role does not unlock.
 */

async function assertAllowed(): Promise<void> {
  if (devAuthBypass()) return;
  const user = await currentUser();
  if (!isAllowed(user?.email)) {
    throw new Error("Not authorized.");
  }
}

const requestSchema = z
  .object({
    toolId: z.string().max(64).optional(),
    text: z.string().max(2000).optional(),
  })
  .refine((v) => Boolean(v.toolId || v.text?.trim()), {
    message: "Ask a question or tap a starter.",
  });

/** The prompt text a turn is stored under — the typed text or the starter's prompt. */
function promptText(toolId: string | undefined, text: string | undefined): string {
  if (text?.trim()) return text.trim();
  if (toolId) {
    const starter = STARTER_QUESTIONS.find((q) => q.toolId === toolId);
    if (starter) return starter.prompt;
    return toolById(toolId)?.label ?? toolId;
  }
  return "";
}

export async function ask(input: {
  toolId?: string;
  text?: string;
}): Promise<AiAnswer> {
  await assertAllowed();
  const request = requestSchema.parse(input);
  const viewer = await resolveAiViewer();

  const result = await answer(viewer, request);
  const userContent = promptText(request.toolId, request.text);

  // Append the turn. A transcript write must never swallow the answer, so a
  // storage hiccup is logged and ignored rather than failing the response.
  try {
    await saveTurn({
      profileId: viewer.profileId,
      face: viewer.role,
      role: "user",
      content: userContent,
      questionId: result.toolId,
    });
    await saveTurn({
      profileId: viewer.profileId,
      face: viewer.role,
      role: "assistant",
      content: [result.headline, ...result.details].join("\n"),
      questionId: result.toolId,
      toolCalls: result.toolId
        ? [{ toolId: result.toolId, capability: result.capability ?? "" }]
        : null,
      toolResults: { headline: result.headline, details: result.details },
    });
  } catch (error) {
    console.error("ai transcript save failed", error);
  }

  return result;
}
