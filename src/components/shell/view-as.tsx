"use client";

import { useRouter } from "next/navigation";
import { Eye, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/auth/roles";
import { roster } from "@/lib/roster";

/**
 * View as (v2 §6). Roles preview through the gv-dev-role cookie the
 * middleware enforces (restrict-only). Client previews bind to a SPECIFIC
 * client via gv-dev-client — a client sees exactly one workspace, nothing
 * else, so the preview does too.
 */

const TEAM_PREVIEWS: { role: Role; label: string }[] = [
  { role: "sales_manager", label: "Sales Manager" },
  { role: "sales_rep", label: "Sales Rep" },
  { role: "team_member", label: "Team Member" },
];

function setCookie(name: string, value: string | null) {
  if (value === null) {
    document.cookie = `${name}=; path=/; max-age=0`;
  } else {
    // NO max-age: a preview is a session cookie, so it dies with the browser
    // session. It used to last 24h, which pinned the owner inside a previewed
    // client workspace long after they meant to look. /exit-preview is the
    // always-available way out.
    document.cookie = `${name}=${value}; path=/`;
  }
}

export function ViewAsMenu() {
  const router = useRouter();

  const preview = (role: Role, clientSlug?: string) => {
    setCookie("gv-dev-role", role);
    setCookie("gv-dev-client", clientSlug ?? null);
    if (role === "client" && clientSlug) {
      window.location.assign(`/w/${clientSlug}`);
    } else {
      router.refresh();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="View as role" />}
      >
        <Eye className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {/* Base UI law: GroupLabel MUST live inside a Group. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-faint text-[11px]">
            Team roles
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {TEAM_PREVIEWS.map((p) => (
          <DropdownMenuItem key={p.role} onClick={() => preview(p.role)}>
            View as {p.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-faint text-[11px]">
            Client portals
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {roster.map((c) => (
          <DropdownMenuItem key={c.slug} onClick={() => preview("client", c.slug)}>
            View as {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ROLE_LABELS: Record<string, string> = {
  sales_manager: "Sales Manager",
  sales_rep: "Sales Rep",
  team_member: "Team Member",
  client: "Client",
};

export function ViewAsBanner({
  role,
  clientName,
}: {
  role: string;
  clientName?: string | null;
}) {
  const exit = () => {
    setCookie("gv-dev-role", null);
    setCookie("gv-dev-client", null);
    // A hard navigation, not a refresh: the preview may be standing on a
    // page the admin shell renders differently (or a workspace-only page).
    window.location.assign("/dashboard");
  };

  return (
    <div className="gv-banner-in bg-warning/15 border-warning/40 text-warning fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur">
      <Eye className="size-4" />
      Previewing as{" "}
      {role === "client" && clientName ? clientName : (ROLE_LABELS[role] ?? role)}
      <button
        type="button"
        onClick={exit}
        className="hover:bg-warning/25 flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all hover:scale-[1.03] active:scale-95"
      >
        <X className="size-3" /> Exit preview
      </button>
    </div>
  );
}
