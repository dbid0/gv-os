/**
 * Month pacing — where the number stands against the goal with the month part
 * gone. Pure so the daily brief's "are we on pace" read is testable and always
 * consistent. A linear projection: whatever's been collected, extrapolated over
 * the whole month at today's run-rate.
 */

export interface MonthPace {
  /** cash ÷ goal, as a percent (0 when no goal is set). */
  pct: number;
  /** Where you'd "should" be today if the goal were hit evenly (goal × elapsed). */
  onPaceCents: number;
  /** cash extrapolated to month-end at the current run-rate. */
  projectedCents: number;
  /** projected ÷ goal, as a percent. */
  projectedPct: number;
  status: "ahead" | "on_track" | "behind" | "no_goal";
}

export function monthPace(
  cashCents: number,
  goalCents: number,
  dayOfMonth: number,
  daysInMonth: number,
): MonthPace {
  const elapsed = daysInMonth > 0 ? Math.min(dayOfMonth, daysInMonth) / daysInMonth : 0;
  const projectedCents = elapsed > 0 ? Math.round(cashCents / elapsed) : 0;

  if (goalCents <= 0) {
    return {
      pct: 0,
      onPaceCents: 0,
      projectedCents,
      projectedPct: 0,
      status: "no_goal",
    };
  }

  const pct = Math.round((cashCents / goalCents) * 100);
  const projectedPct = Math.round((projectedCents / goalCents) * 100);
  const status: MonthPace["status"] =
    projectedPct >= 100 ? "ahead" : projectedPct >= 85 ? "on_track" : "behind";

  return {
    pct,
    onPaceCents: Math.round(goalCents * elapsed),
    projectedCents,
    projectedPct,
    status,
  };
}
