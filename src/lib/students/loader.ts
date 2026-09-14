import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { offerSettings } from "@/db/schema/app";
import {
  buildStudents,
  groupByCohort,
  OPEN_PROGRAM,
  summarizeStudents,
  type CohortColumn,
  type ProgramSettings,
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
  program: ProgramSettings;
};

/** An offer's student program settings; open-ended when none are saved. */
export async function programSettingsFor(clientId: string): Promise<ProgramSettings> {
  const db = getDb();
  const [row] = await db
    .select({
      minPaymentCents: offerSettings.studentMinPaymentCents,
      lengthWeeks: offerSettings.programLengthWeeks,
    })
    .from(offerSettings)
    .where(eq(offerSettings.clientId, clientId))
    .limit(1);
  return row ?? OPEN_PROGRAM;
}

/**
 * The students board for one offer, from the same dashboard payment feed the
 * workspace hero counts (processor first, sheet fallback, tag rules applied)
 * and the same alias map, so the buyers here are the payers there.
 */
export async function loadStudentsBoard(
  clientId: string,
  now: Date,
): Promise<StudentsBoardData> {
  const [snaps, program] = await Promise.all([
    latestSnapshotsBySource(clientId),
    programSettingsFor(clientId).catch(() => OPEN_PROGRAM),
  ]);
  const paySource = pickPaySource(snaps);
  if (!paySource) {
    const board: StudentsBoard = {
      students: [],
      undatedPayers: 0,
      belowMinimumPayers: 0,
    };
    return {
      source: null,
      syncedAt: null,
      board,
      columns: groupByCohort([], program.lengthWeeks),
      summary: summarizeStudents([]),
      program,
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
    for (const lead of await leadsForClient(sheet.syncId, [], aliases)) {
      if (lead.name) namesByEmail.set(lead.email.trim().toLowerCase(), lead.name);
    }
  }

  const { kept } = applyTagRulesToFeed(payments, rules);
  const board = buildStudents(kept, now, { aliases, namesByEmail, program });
  return {
    source: paySource.source === "stripe" ? "stripe" : "sheet",
    syncedAt: paySource.snapshot.syncedAt,
    board,
    columns: groupByCohort(board.students, program.lengthWeeks),
    summary: summarizeStudents(board.students),
    program,
  };
}
