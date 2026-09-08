/**
 * "▲ $2,400 vs last period ($8,100)" — every hero number carries its own
 * context. Green up, amber down, and NOTHING when there is no previous
 * period (all-time) or no basis — a delta against nothing is a made-up
 * number. Server-rendered.
 */
export function PeriodDelta({
  currentCents,
  previousCents,
}: {
  currentCents: number;
  previousCents: number | null;
}) {
  if (previousCents === null) return null;
  // Two zeros have nothing to compare — "▲ $0 vs $0" is noise, not context.
  if (currentCents === 0 && previousCents === 0) return null;
  const delta = currentCents - previousCents;
  const usd = (c: number) =>
    `$${(Math.abs(c) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const up = delta >= 0;
  return (
    <p className="mt-1 text-xs">
      <span className={up ? "text-success font-medium" : "text-warning font-medium"}>
        {up ? "▲" : "▼"} {usd(delta)}
      </span>{" "}
      <span className="text-faint">vs last period ({usd(previousCents)})</span>
    </p>
  );
}
