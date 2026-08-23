/**
 * The dashboard hero's growth curve (Whop-style): a cumulative area of what
 * was collected across the selected range. Hand-drawn SVG — no chart library,
 * no runtime cost. Thin line, soft brand-gradient fill, a dot on the latest
 * point. Renders nothing below two points (a single dot is not a trend).
 */
export function CollectedSparkline({
  series,
  className,
}: {
  series: { day: string; cents: number }[];
  className?: string;
}) {
  if (series.length < 2) return null;

  // Cumulate into a rising curve (pure — no mutation across render).
  const cumulative = series.map((_, i) =>
    series.slice(0, i + 1).reduce((sum, r) => sum + r.cents, 0),
  );

  const W = 600;
  const H = 120;
  const PAD = 4;
  const max = Math.max(...cumulative);
  const min = Math.min(cumulative[0], 0);
  const span = max - min || 1;
  const n = cumulative.length;

  const x = (i: number) => PAD + (i / (n - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const line = cumulative.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M ${x(0)},${H - PAD} L ${cumulative
    .map((v, i) => `${x(i)},${y(v)}`)
    .join(" L ")} L ${x(n - 1)},${H - PAD} Z`;

  const lastX = x(n - 1);
  const lastY = y(cumulative[n - 1]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="gv-collected-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#gv-collected-fill)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r="3.5" fill="var(--brand)" />
    </svg>
  );
}
