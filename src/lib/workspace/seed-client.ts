import "server-only";

import { getDb } from "@/db/client";
import { copyTemplateIntoClient } from "@/lib/workspace/copy-template";

/**
 * Give a client teamspace its onboarding section, copied from the agency
 * Client Template. Best-effort: callers treat a thrown error as "no seed",
 * never as "no client".
 *
 * The copy itself lives in `copy-template` so the backfill script runs exactly
 * this logic against an existing database instead of a second implementation.
 */
export async function seedClientWorkspaceFromTemplate(
  clientId: string,
): Promise<{ copied: number }> {
  return copyTemplateIntoClient(getDb(), clientId);
}
