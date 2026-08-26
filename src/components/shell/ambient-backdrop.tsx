import { cn } from "@/lib/utils";

/**
 * A subtle, always-moving "rising chart" texture for hero and overview surfaces
 * — a faint equalizer of brand-tinted bars that breathe upward, the Whop-style
 * ambient motion behind the numbers. Purely decorative: no data, no JS, no
 * runtime cost, aria-hidden, and auto-stilled under prefers-reduced-motion by
 * the global base rule. Sits inside a positioned, clipped parent.
 */
export function AmbientBackdrop({
  bars = 32,
  className,
}: {
  bars?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden opacity-[0.13]",
        className,
      )}
    >
      <div className="absolute inset-x-0 bottom-0 flex h-full items-end gap-[1.5%] px-[1%]">
        {Array.from({ length: bars }).map((_, i) => (
          <span
            key={i}
            className="gv-ambient-bar flex-1"
            // Heights and timings are spread by index so it reads as a living
            // chart, not a metronome. Deterministic (no Math.random) for SSR.
            style={{
              height: `${28 + ((i * 53) % 55)}%`,
              animationDelay: `${((i * 7) % 40) * -0.12}s`,
              animationDuration: `${3.6 + ((i * 13) % 20) / 10}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
