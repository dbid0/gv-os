import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The house empty state — the reference pattern: a dotted-texture field, an
 * icon chip, one bold line saying what's absent, one muted line saying how
 * it starts existing, and at most ONE call to action. An empty surface that
 * explains itself reads as "not started yet"; a bare panel reads as broken.
 */
export function EmptyState({
  icon: Icon,
  title,
  explainer,
  action,
}: {
  icon: LucideIcon;
  title: string;
  explainer: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center"
      style={{
        backgroundImage:
          "radial-gradient(color-mix(in oklab, var(--foreground) 7%, transparent) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <span className="bg-secondary/70 grid size-12 place-items-center rounded-xl border shadow-sm">
        <Icon className="text-brand size-5" />
      </span>
      <div>
        <p className="text-foreground text-sm font-semibold">{title}</p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-xs">
          {explainer}
        </p>
      </div>
      {action}
    </div>
  );
}
