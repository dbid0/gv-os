"use client";

import Image from "next/image";

import { ClientLogo } from "@/components/clients/client-logo";

/** The minimum a teamspace needs to draw its icon — a subset of `TeamspaceView`. */
export interface TeamspaceLike {
  /** The client slug, for its logo. Null = the Global Ventures agency. */
  slug: string | null;
  name: string;
  accent: string;
}

/**
 * A teamspace's icon: a client's logo, or the Global Ventures mark for the
 * agency teamspace. Extracted so both the workspace shell and the Home
 * dashboard draw the exact same chip from the exact same code.
 */
export function TeamspaceIcon({ ts, size = 20 }: { ts: TeamspaceLike; size?: number }) {
  if (ts.slug) {
    return (
      <ClientLogo
        slug={ts.slug}
        name={ts.name}
        accent={ts.accent}
        size={size}
        radius="md"
      />
    );
  }
  return (
    <span
      className="bg-card grid shrink-0 place-items-center rounded-[5px] border"
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand/gv-mark-white.png"
        alt=""
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        className="object-contain"
        style={{ width: size * 0.62, height: size * 0.62 }}
      />
    </span>
  );
}
