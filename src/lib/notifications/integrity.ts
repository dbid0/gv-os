/**
 * MONEY INTEGRITY, GIVEN A VOICE.
 *
 * The reconcilers already raise an alert when the books stop agreeing — sheet
 * drift above the 5-cent baseline, and Money Spine drift where a source and the
 * ledger disagree for an offer-month. Those alerts sat in the bell beside
 * signed agreements and EOD reminders, which is how a real money problem gets
 * scrolled past. This is the rule for lifting them into a banner on every page
 * an owner opens, until someone has reviewed them.
 *
 * The banner speaks about REVIEW, not about the present state of the books: an
 * unreviewed alert means "someone should look", not "the books are wrong right
 * now" — the reconciliation page is where the current state lives.
 *
 * Pure: no database.
 */

/** Notification kinds that mean the money doesn't reconcile. */
export const INTEGRITY_KINDS = ["spine_drift", "sheet_drift"] as const;

export type IntegrityAlert = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  createdAt: Date;
};

export type IntegrityBannerModel = {
  /** Every unreviewed integrity alert's id, for "mark reviewed". */
  ids: string[];
  count: number;
  /** Critical if any alert is critical. */
  severity: "critical" | "warning";
  headline: string;
  /** The first few alert titles, most severe and newest first. */
  lines: string[];
};

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1 };

export function isIntegrityKind(kind: string): boolean {
  return (INTEGRITY_KINDS as readonly string[]).includes(kind);
}

/**
 * The banner for a set of unreviewed alerts, or null when there is nothing to
 * say. Non-integrity kinds are ignored even if passed in.
 */
export function integrityBanner(
  alerts: IntegrityAlert[],
  maxLines = 3,
): IntegrityBannerModel | null {
  const relevant = alerts
    .filter((a) => isIntegrityKind(a.kind))
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 2) - (SEVERITY_RANK[b.severity] ?? 2) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
  if (relevant.length === 0) return null;

  const count = relevant.length;
  return {
    ids: relevant.map((a) => a.id),
    count,
    severity: relevant.some((a) => a.severity === "critical") ? "critical" : "warning",
    headline: `${count} money-integrity alert${count === 1 ? "" : "s"} not yet reviewed`,
    lines: relevant.slice(0, maxLines).map((a) => a.title),
  };
}
