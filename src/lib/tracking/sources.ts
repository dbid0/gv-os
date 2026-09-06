/**
 * WHERE A FACT CAME FROM, AND WHICH SOURCE WINS.
 *
 * The tracking sheet is a hand-typed copy of things that already happened in
 * other systems. Close knows exactly when a call was dialled; Calendly knows
 * exactly when it was booked; Stripe knows exactly when the money moved. A rep
 * retyping any of that into a spreadsheet is the only step that can lose it —
 * and it does: 105 of 112 call rows on the live sheet carry no date at all,
 * while the booking system that created every one of them knows the minute.
 *
 * So a fact is not owned by whoever wrote it down last. It is owned by the
 * system that PERFORMED it, and everything else fills gaps. This module is the
 * rule for that, kept pure so precedence is one decision in one place rather
 * than an ordering that drifts between screens.
 *
 * Three commitments:
 *   • a live system always outranks the sheet for a fact it owns;
 *   • a lower-ranked source may FILL a gap but never OVERWRITE;
 *   • when two sources both know and disagree, that is reported, not resolved.
 *     Silently picking one is how a number stops being checkable.
 */

/** Every system a tracking fact can come from. */
export const FACT_SOURCES = [
  "sheet",
  "close",
  "calendly",
  "iclosed",
  "stripe",
  "whop",
  "fanbasis",
  "typeform",
  "fathom",
] as const;

export type FactSource = (typeof FACT_SOURCES)[number];

/** The kinds of fact whose ownership differs by system. */
export type FactKind =
  | "identity"
  | "application"
  | "booking"
  | "callActivity"
  | "callOutcome"
  | "payment"
  | "recording";

/**
 * Who owns what.
 *
 * Higher wins. A source absent from a row cannot supply that kind of fact at
 * all — Stripe has no opinion on when a call was booked, and asking it for one
 * is how a wrong number gets an authoritative-looking provenance label.
 *
 * The sheet is present everywhere at rank 1: it is the fallback for every kind
 * and the winner for none. That is the whole design in one line.
 */
const OWNERSHIP: Record<FactKind, Partial<Record<FactSource, number>>> = {
  // Who the lead is. The form they filled in is definitive.
  identity: { sheet: 1, typeform: 5, close: 4, stripe: 2, whop: 2, fanbasis: 2 },
  // That they applied, and when.
  application: { sheet: 1, typeform: 5, close: 3 },
  // When a call was booked. The calendar that created it knows.
  booking: { sheet: 1, calendly: 5, iclosed: 5, close: 3 },
  // Dials, texts, connection — the dialler's own record.
  callActivity: { sheet: 1, close: 5 },
  // What happened on the call. The closer's own report is the best account of
  // this: no API knows whether the prospect said yes, only the human on it.
  callOutcome: { sheet: 4, close: 3, fathom: 2 },
  // Money. The processor is the only honest answer.
  payment: { sheet: 1, stripe: 5, whop: 5, fanbasis: 5, close: 2 },
  // The recording itself.
  recording: { sheet: 3, fathom: 5 },
};

/** Can this source speak to this kind of fact at all? */
export function canSupply(kind: FactKind, source: FactSource): boolean {
  return OWNERSHIP[kind][source] !== undefined;
}

/** Rank of a source for a kind of fact; 0 means it has no standing. */
export function sourceRank(kind: FactKind, source: FactSource): number {
  return OWNERSHIP[kind][source] ?? 0;
}

export interface Candidate<T> {
  source: FactSource;
  value: T | null;
  /** When the source recorded it, for breaking ties between equal ranks. */
  observedAt?: Date | null;
}

export interface Resolved<T> {
  value: T | null;
  /** Which source the value came from; null when nobody knew. */
  source: FactSource | null;
  /** Sources that also had a value and disagreed. */
  conflictingSources: FactSource[];
  /** True when a lower-ranked source supplied it because the owner was silent. */
  filledGap: boolean;
}

/**
 * Resolve one fact from every source that offered a value.
 *
 * Equal-rank sources are broken by the most recent observation, then by the
 * order given, so the result never depends on map iteration order.
 */
export function resolveFact<T>(
  kind: FactKind,
  candidates: Candidate<T>[],
  isEqual: (a: T, b: T) => boolean = (a, b) => a === b,
): Resolved<T> {
  const usable = candidates.filter(
    (c) => c.value !== null && c.value !== undefined && canSupply(kind, c.source),
  );
  if (usable.length === 0) {
    return { value: null, source: null, conflictingSources: [], filledGap: false };
  }

  const ranked = [...usable].sort((a, b) => {
    const byRank = sourceRank(kind, b.source) - sourceRank(kind, a.source);
    if (byRank !== 0) return byRank;
    const at = a.observedAt?.getTime() ?? 0;
    const bt = b.observedAt?.getTime() ?? 0;
    return bt - at;
  });

  const winner = ranked[0];
  const topRank = sourceRank(kind, winner.source);
  const conflicting = ranked
    .slice(1)
    .filter((c) => !isEqual(c.value as T, winner.value as T))
    .map((c) => c.source);

  // A gap was filled when the source that won is not the highest-ranked source
  // that COULD have answered — i.e. an owner stayed silent.
  const bestPossible = Math.max(
    ...usable.map((c) => sourceRank(kind, c.source)),
    ...Object.values(OWNERSHIP[kind]).map((r) => r ?? 0),
  );
  return {
    value: winner.value,
    source: winner.source,
    conflictingSources: [...new Set(conflicting)],
    filledGap: topRank < bestPossible,
  };
}

/** A disagreement worth a person's attention. */
export interface FactConflict {
  kind: FactKind;
  field: string;
  winner: FactSource;
  losers: FactSource[];
}

/**
 * Collect the disagreements out of a set of resolved facts.
 *
 * Reported rather than resolved on purpose. Two systems disagreeing about when
 * money moved is a real problem in the business, not a rendering detail, and
 * hiding it behind a precedence rule is how it stays hidden.
 */
export function collectConflicts(
  resolved: { kind: FactKind; field: string; result: Resolved<unknown> }[],
): FactConflict[] {
  return resolved
    .filter((r) => r.result.conflictingSources.length > 0 && r.result.source !== null)
    .map((r) => ({
      kind: r.kind,
      field: r.field,
      winner: r.result.source as FactSource,
      losers: r.result.conflictingSources,
    }));
}

/** Plain-language label for a source, for provenance shown to a person. */
export const SOURCE_LABEL: Record<FactSource, string> = {
  sheet: "tracking sheet",
  close: "Close",
  calendly: "Calendly",
  iclosed: "iClosed",
  stripe: "Stripe",
  whop: "Whop",
  fanbasis: "Fanbasis",
  typeform: "Typeform",
  fathom: "Fathom",
};
