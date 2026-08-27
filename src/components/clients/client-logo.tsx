"use client";

import { useState } from "react";

import { clientInitial } from "@/lib/roster";
import { cn } from "@/lib/utils";

/**
 * The one way a client logo is rendered anywhere in the app.
 *
 * It points at the cached image route (`/api/clients/[slug]/logo`) instead of
 * an inline data URL, so the shell no longer ships every client's logo in the
 * RSC payload on every navigation. Because every logo now goes through this one
 * component, they render identically everywhere — the consistency Daniel asked
 * for.
 *
 * On a missing logo (the route 404s) or any load error, it falls back to the
 * accent-coloured initial — the same fallback the sidebar and client cards used
 * before, keyed off the canonical `clientInitial` helper.
 */
export function ClientLogo({
  slug,
  name,
  accent,
  size,
  radius = "lg",
  className,
}: {
  slug: string;
  name: string;
  accent: string;
  /** Rendered size in px (square). */
  size: number;
  /** Corner radius — "md" for the sidebar chips, "lg" everywhere else. */
  radius?: "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // A reused instance pointed at a new client must retry, not stay latched on
  // the previous client's fallback (e.g. the sidebar switcher trigger, whose
  // one instance follows the active client). Resetting during render on the
  // slug change is React's own no-effect idiom for this.
  const [renderedSlug, setRenderedSlug] = useState(slug);
  if (slug !== renderedSlug) {
    setRenderedSlug(slug);
    setFailed(false);
  }

  const rounded = radius === "md" ? "rounded-md" : "rounded-lg";
  const box = { width: size, height: size };

  if (failed) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center border font-bold",
          rounded,
          className,
        )}
        style={{
          ...box,
          color: accent,
          borderColor: `${accent}55`,
          background: `${accent}14`,
          fontSize: Math.round(size * 0.36),
        }}
      >
        {clientInitial(name)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- served by the cached /api/clients/[slug]/logo route, not a static asset the optimizer can handle
    <img
      src={`/api/clients/${slug}/logo`}
      alt=""
      onError={() => setFailed(true)}
      style={box}
      className={cn("shrink-0 border object-cover", rounded, className)}
    />
  );
}
