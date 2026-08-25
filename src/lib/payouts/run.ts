/**
 * Assembling a month's payout run — pure, so which rows get created is testable
 * without a database. Today it turns each client's computed rev-share into a
 * `revshare_received` receivable row; it is IDEMPOTENT — a client already on the
 * month's run is skipped, so re-generating never doubles a receivable.
 *
 * (The 50/50 partner split and rep-commission lines build on this same
 * assembler in follow-ups; kept separate so each money row is added deliberately.)
 */

export interface RevShareOwedInput {
  clientId: string;
  clientName: string;
  revShareCents: number;
}

export interface PayoutDraft {
  month: string;
  kind: "revshare_received";
  label: string;
  clientId: string;
  baseCents: number;
}

export function assembleRevShareRun(
  month: string,
  owed: RevShareOwedInput[],
  existingClientIds: ReadonlySet<string>,
): PayoutDraft[] {
  return owed
    .filter((o) => o.revShareCents > 0 && !existingClientIds.has(o.clientId))
    .map((o) => ({
      month,
      kind: "revshare_received" as const,
      label: `${o.clientName} — rev-share`,
      clientId: o.clientId,
      baseCents: o.revShareCents,
    }));
}
