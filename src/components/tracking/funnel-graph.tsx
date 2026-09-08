import { formatRate, type OfferFunnel } from "@/lib/tracking/funnel";

/**
 * The funnel as a FLOW — glowing stage nodes joined by edges that carry the
 * advance rates, so causality reads at a glance instead of being assembled
 * from bars. One thing the bars could never draw: the low-ticket motion
 * enters "Paid" on its own edge from outside the pipeline, because more
 * people paying than closing is the OFFER's shape, and the graph should say
 * so instead of leaving the reader to reconcile it.
 *
 * Server-rendered SVG. Wide content scrolls inside its own container.
 */
const NODE_W = 128;
const NODE_H = 64;
const GAP = 96;

export function FunnelGraph({ funnel }: { funnel: OfferFunnel }) {
  const stages = funnel.stages;
  const n = stages.length;
  const width = n * NODE_W + (n - 1) * GAP + 16;
  const hasDirect = funnel.paidWithoutDeal > 0;
  const height = hasDirect ? 208 : 140;
  const topY = 20;

  const x = (i: number) => 8 + i * (NODE_W + GAP);
  const paidIndex = stages.findIndex((s) => s.key === "paid");

  const toneFor = (key: string) =>
    key === "paid" || key === "closed" ? "var(--success)" : "var(--brand)";

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ minWidth: width }}
        className="h-auto w-full"
        role="img"
        aria-label="Funnel flow"
      >
        {/* edges between consecutive stages, rate riding each edge */}
        {funnel.steps.map((step, i) => {
          const x1 = x(i) + NODE_W;
          const x2 = x(i + 1);
          const midY = topY + NODE_H / 2;
          return (
            <g key={step.from + step.to}>
              <path
                d={`M ${x1} ${midY} C ${x1 + GAP / 2} ${midY}, ${x2 - GAP / 2} ${midY}, ${x2} ${midY}`}
                fill="none"
                stroke="var(--border)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text
                x={(x1 + x2) / 2}
                y={midY - 10}
                textAnchor="middle"
                fill="var(--foreground)"
                fontSize="10"
                fontWeight="600"
              >
                {formatRate(step.rate)}
              </text>
              <text
                x={(x1 + x2) / 2}
                y={midY + 14}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize="8.5"
              >
                {step.advanced} of {step.eligible}
              </text>
            </g>
          );
        })}

        {/* the direct-buyer edge into Paid — the second motion, drawn */}
        {hasDirect && paidIndex >= 0 && (
          <g>
            <rect
              x={x(Math.max(paidIndex - 1, 0))}
              y={topY + NODE_H + 44}
              width={NODE_W}
              height={44}
              rx="10"
              fill="var(--card)"
              stroke="var(--warning)"
              strokeOpacity="0.5"
            />
            <text
              x={x(Math.max(paidIndex - 1, 0)) + NODE_W / 2}
              y={topY + NODE_H + 62}
              textAnchor="middle"
              fill="var(--warning)"
              fontSize="12"
              fontWeight="700"
            >
              {funnel.paidWithoutDeal}
            </text>
            <text
              x={x(Math.max(paidIndex - 1, 0)) + NODE_W / 2}
              y={topY + NODE_H + 76}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize="8.5"
            >
              bought direct — no deal row
            </text>
            <path
              d={`M ${x(Math.max(paidIndex - 1, 0)) + NODE_W} ${topY + NODE_H + 66}
                  C ${x(paidIndex) + NODE_W / 2} ${topY + NODE_H + 66},
                    ${x(paidIndex) + NODE_W / 2} ${topY + NODE_H + 30},
                    ${x(paidIndex) + NODE_W / 2} ${topY + NODE_H}`}
              fill="none"
              stroke="var(--warning)"
              strokeOpacity="0.6"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          </g>
        )}

        {/* stage nodes */}
        {stages.map((stage, i) => (
          <g key={stage.key}>
            <rect
              x={x(i)}
              y={topY}
              width={NODE_W}
              height={NODE_H}
              rx="12"
              fill="var(--card)"
              stroke={toneFor(stage.key)}
              strokeOpacity="0.45"
              style={{
                filter: `drop-shadow(0 0 10px color-mix(in oklab, ${toneFor(stage.key)} 25%, transparent))`,
              }}
            />
            <text
              x={x(i) + NODE_W / 2}
              y={topY + 28}
              textAnchor="middle"
              fill="var(--foreground)"
              fontSize="18"
              fontWeight="700"
              className="numeric"
            >
              {stage.leads.toLocaleString("en-US")}
            </text>
            <text
              x={x(i) + NODE_W / 2}
              y={topY + 46}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize="9.5"
              style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              {stage.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
