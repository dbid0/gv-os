"use client";

import { useRouter } from "next/navigation";
import { Eye, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Role } from "@/lib/auth/roles";

/**
 * View as (v2 §6): the middleware already narrows routes from the
 * gv-dev-role cookie (restrict-only — it can never widen). This menu just
 * sets it, and the banner makes the preview state impossible to forget.
 */

const PREVIEWABLE: { role: Role; label: string }[] = [
  { role: "sales_manager", label: "Sales Manager" },
  { role: "sales_rep", label: "Sales Rep" },
  { role: "team_member", label: "Team Member" },
  { role: "client", label: "Client" },
];

function setRoleCookie(role: string | null) {
  if (role === null) {
    document.cookie = "gv-dev-role=; path=/; max-age=0";
  } else {
    document.cookie = `gv-dev-role=${role}; path=/; max-age=86400`;
  }
}

export function ViewAsMenu() {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="View as role" />}
      >
        <Eye className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {PREVIEWABLE.map((p) => (
          <DropdownMenuItem
            key={p.role}
            onClick={() => {
              setRoleCookie(p.role);
              router.refresh();
            }}
          >
            View as {p.label}
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

export function ViewAsBanner({ role }: { role: string }) {
  const router = useRouter();
  return (
    <div className="bg-warning/15 border-warning/40 text-warning fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur">
      <Eye className="size-4" />
      Previewing as {ROLE_LABELS[role] ?? role}
      <button
        type="button"
        onClick={() => {
          setRoleCookie(null);
          router.refresh();
        }}
        className="hover:bg-warning/20 flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors"
      >
        <X className="size-3" /> Exit
      </button>
    </div>
  );
}
