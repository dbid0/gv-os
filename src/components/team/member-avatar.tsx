import { cn } from "@/lib/utils";

/**
 * The deterministic colour-from-name avatar the team surfaces share.
 *
 * A person gets one consistent colour from their name — purely decorative, so
 * the roster and a profile read as faces, not spreadsheet rows. Static (no
 * runtime cost), and the same seed always lands on the same colour, so a member
 * looks identical in the roster table and on their own profile.
 */
const AVATAR_COLORS = [
  "#52b7ff",
  "#9b6bff",
  "#2dd4bf",
  "#f59e0b",
  "#f472b6",
  "#4ade80",
  "#60a5fa",
  "#fb7185",
] as const;

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (
      (parts[0]?.[0] ?? "") +
      (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")
    ).toUpperCase() || "?"
  );
}

const SIZES = {
  sm: "size-8 text-[11px]",
  lg: "size-12 text-base",
  xl: "size-16 text-xl",
} as const;

/** A coloured monogram tile. `size` scales the circle and the initials. */
export function MemberAvatar({
  name,
  size = "sm",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const c = avatarColor(name);
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        SIZES[size],
        className,
      )}
      style={{
        background: `color-mix(in oklab, ${c} 16%, transparent)`,
        color: c,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 34%, transparent)`,
      }}
    >
      {initials(name)}
    </span>
  );
}
