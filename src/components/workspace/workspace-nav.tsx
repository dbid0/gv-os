"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** The workspace command-center sections (v2 §4, Phase 4). */
const SECTIONS = [
  { label: "Dashboard", path: "" },
  { label: "Sales", path: "/sales" },
  { label: "Marketing", path: "/marketing" },
  { label: "Email", path: "/email" },
  { label: "CRM", path: "/crm" },
] as const;

export function WorkspaceNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/w/${slug}`;

  return (
    <nav className="flex flex-wrap gap-1" aria-label="Workspace sections">
      {SECTIONS.map((s) => {
        const href = `${base}${s.path}`;
        const active = s.path === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={s.label}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs transition-colors",
              active
                ? "bg-brand-soft/70 text-foreground border-brand/40 border font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
