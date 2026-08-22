import { cn } from "@/lib/utils";

/**
 * Status vocabulary.
 *
 * Every state in the app comes from this list, so "live" looks identical on the
 * dashboard, in a client row, and on a deal. The moment each screen invents its
 * own green, the interface stops being readable at a glance.
 *
 * Only `live` gets the brand colour. Everything else is grey by brightness,
 * which is the GV pattern: attention is a scarce resource.
 */

export type StatusTone =
  "live" | "active" | "pending" | "muted" | "danger" | "good" | "progress";

const tones: Record<StatusTone, { dot: string; text: string; ring: string }> = {
  // v2 semantic colors (spec §0): green = good/closed, yellow = in-progress,
  // red = bad. These THREE carry meaning app-wide — never repurpose them.
  good: {
    dot: "bg-success",
    text: "text-success",
    ring: "border-success/35 bg-success/10",
  },
  progress: {
    dot: "bg-warning",
    text: "text-warning",
    ring: "border-warning/35 bg-warning/10",
  },
  live: {
    dot: "dot-brand",
    text: "text-brand",
    ring: "border-brand/35 bg-brand-soft/60",
  },
  active: {
    dot: "bg-foreground",
    text: "text-foreground",
    ring: "border-border-strong bg-secondary",
  },
  pending: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    ring: "border-border bg-muted",
  },
  muted: {
    dot: "bg-faint",
    text: "text-faint",
    ring: "border-border bg-transparent",
  },
  danger: {
    dot: "bg-destructive",
    text: "text-destructive",
    ring: "border-destructive/35 bg-destructive/10",
  },
};

/** A bare dot. For dense rows where a full pill would be noise. */
export function StatusDot({
  tone = "pending",
  className,
}: {
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 rounded-full", tones[tone].dot, className)}
    />
  );
}

/** Dot plus label in a hairline pill. The standard status chip. */
export function StatusPill({
  tone = "pending",
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  const t = tones[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
        t.ring,
        className,
      )}
    >
      <StatusDot tone={tone} />
      <span className={cn(tone === "live" ? "text-foreground" : t.text)}>
        {children}
      </span>
    </span>
  );
}
