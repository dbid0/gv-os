"use client";

import { isImageIcon } from "@/lib/workspace/emoji-data";
import { cn } from "@/lib/utils";

/**
 * A page's icon, wherever it is drawn (sidebar row, breadcrumb, page header).
 *
 * An icon is normally an emoji glyph, but it can also be an UPLOADED IMAGE, in
 * which case the stored value is that image's URL. Routing both through this one
 * component means a custom icon — the GV logo, a client's mark — renders as a
 * picture everywhere instead of leaking a raw URL into the text.
 */
export function PageIcon({
  icon,
  fallback = null,
  className,
}: {
  icon: string | null | undefined;
  /** Rendered when there is no icon at all (e.g. a generic file glyph). */
  fallback?: React.ReactNode;
  /** Sizing/spacing for the glyph or image. */
  className?: string;
}) {
  if (!icon) return <>{fallback}</>;
  if (isImageIcon(icon)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user-uploaded icon, arbitrary host
      <img
        src={icon}
        alt=""
        draggable={false}
        className={cn("size-[1em] rounded-[0.2em] object-contain", className)}
      />
    );
  }
  return <span className={className}>{icon}</span>;
}
