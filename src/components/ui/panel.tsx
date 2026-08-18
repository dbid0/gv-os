import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A titled surface.
 *
 * shadcn's Card is the primitive; Panel is how GV OS actually uses it: a
 * gradient surface, a hairline, a small-caps title, an optional right-hand slot
 * for status, and the named card elevation. Screens compose Panels rather than
 * restyling Cards, so a change to the surface treatment happens in one file.
 */
export function Panel({
  title,
  aside,
  children,
  className,
  padded = true,
}: {
  title?: string;
  /** Right-aligned slot on the title row: status pill, count, action. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn("card-grad elev-card overflow-hidden rounded-xl border", className)}
    >
      {(title || aside) && (
        <header className="flex items-center justify-between gap-4 border-b px-5 py-3.5">
          {title && <h2 className="text-sm font-medium">{title}</h2>}
          {aside}
        </header>
      )}

      <div className={cn(padded && "p-5")}>{children}</div>
    </section>
  );
}

/**
 * A hairline-separated list. The default way to show rows of anything.
 *
 * Uses a 1px gap over a border-coloured background rather than per-row borders,
 * so there is never a doubled line where two rows meet or a stray edge at the
 * bottom of the list.
 */
export function Rows({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-border flex flex-col gap-px", className)}>{children}</div>
  );
}

export function Row({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-card flex items-center gap-4 px-5 py-3.5",
        interactive && "hover:bg-secondary transition-colors",
        className,
      )}
    >
      {children}
    </div>
  );
}
