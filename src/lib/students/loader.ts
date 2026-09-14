import "server-only";

import {
  buildStudents,
  groupByCohort,
  summarizeStudents,
  type CohortColumn,
  type StudentsBoard,
  type StudentsSummary,
} from "@/lib/students/board";
import { aliasMapForClient } from "@/lib/tracking/aliases-store";
import {
  cashRowsForClient,
  currentSnapshot,
  latestSnapshotsBySource,
  leadsForClient,
  pickPaySource,
} from "@/lib/tracking/queries";
import { applyTagRulesToFeed } from "@/lib/tracking/tag-rules";
import { listTagRules } from "@/lib/tracking/tag-rules-store";

export type StudentsBoardData = {
  /** Which feed the buyers came from, or null when the offer has no payments. */
  source: "stripe" | "sheet" | null;
  syncedAt: Date | null;
  board: StudentsBoard;
  columns: CohortColumn[];
  summary: StudentsSummary;
};

/**
 * The students board for one offer, from the same dashboard payment feed the
 * workspace hero counts (processor first, sheet fallback, tag rules applied)
 * and the same alias map, so the buyers here are the payers there.
 */
export async function loadStudentsBoard(
  clientId: string,
  now: Date,
): Promise<StudentsBoardData> {
  const snaps = await latestSnapshotsBySource(clientId);
  const paySource = pickPaySource(snaps);
  if (!paySource) {
    const board: StudentsBoard = { students: [], undatedPayers: 0 };
    return {
      source: null,
      syncedAt: null,
      board,
      columns: groupByCohort([]),
      summary: summarizeStudents([]),
    };
  }

  const [{ payments }, aliases, rules, sheet] = await Promise.all([
    cashRowsForClient(paySource.snapshot.syncId),
    aliasMapForClient(clientId),
    listTagRules(clientId).catch(() => []),
    currentSnapshot(clientId),
  ]);

  // Names from the lead record when the payment rows carry none.
  const namesByEmail = new Map<string, string>();
  if (sheet) {
    for (const lead of await leadsForClient(sheet.syncId)) {
      if (lead.name) namesByEmail.set(lead.email.trim().toLowerCase(), lead.name);
    }
  }

  const { kept } = applyTagRulesToFeed(payments, rules);
  const board = buildStudents(kept, now, { aliases, namesByEmail });
  return {
    source: paySource.source === "stripe" ? "stripe" : "sheet",
    syncedAt: paySource.snapshot.syncedAt,
    board,
    columns: groupByCohort(board.students),
    summary: summarizeStudents(board.students),
  };
}
