import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The settings page's card anatomy, taken from the reference product's
 * settings tab: each topic is one generous card that opens with an icon and a
 * display heading, explains itself in a line of muted prose, then lays its
 * controls below. Panels elsewhere keep the small-caps header bar; settings
 * reads like a page of titled paragraphs you can operate.
 */
export function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  aside,
  children,
  className,
}: {
  /** Anchor target, so the side nav can jump straight to this section. */
  id?: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Right-aligned slot on the heading row: a caveat, a status, an action. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      // Clear the sticky topbar when jumped to, or the heading lands under it.
      className={cn(
        "card-grad elev-card scroll-mt-20 rounded-2xl border p-6",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        {aside && <div className="text-faint pt-1 text-xs">{aside}</div>}
      </div>
      {description && (
        <p className="text-muted-foreground mt-1.5 max-w-prose text-sm">
          {description}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}
