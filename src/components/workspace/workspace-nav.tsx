"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The workspace command-center sections.
 *
 * `adminOnly` marks the ones that are GV's view of the offer rather than the
 * client's. Tracking is the sync console — mirrored row counts, the sheet id,
 * which columns this app did not recognise, and a running critique of the
 * client's own data hygiene ("105 of 112 call rows have no date"). Useful to
 * us, and not something to hand a client inside their own workspace.
 */
const SECTIONS = [
  { label: "Dashboard", path: "" },
  { label: "Sales", path: "/sales" },
  { label: "Marketing", path: "/marketing" },
  { label: "Email", path: "/email" },
  { label: "CRM", path: "/crm" },
  { label: "Leads", path: "/leads" },
  { label: "Tracking", path: "/tracking", adminOnly: true },
  { label: "Onboarding", path: "/onboarding" },
] as const;

/**
 * The ADMIN-only sections of the same client — GV's own read on them.
 *
 * These live under /clients/[slug] rather than /w/[slug], but they are shown
 * here on purpose: Daniel had to choose between "Open workspace" and "Manage"
 * without knowing which held what. One door — you enter the workspace and
 * everything about that client is reachable from this one bar, with the
 * owner-only surfaces marked off to the right.
 */
const ADMIN_SECTIONS = [
  { label: "Docs", path: "/workspace" },
  { label: "Accounting", path: "/accounting" },
  { label: "Setup", path: "/setup" },
] as const;

export function WorkspaceNav({
  slug,
  admin = false,
}: {
  slug: string;
  admin?: boolean;
}) {
  const pathname = usePathname();
  const base = `/w/${slug}`;
  const adminBase = `/clients/${slug}`;

  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Workspace sections">
      {SECTIONS.filter((s) => admin || !("adminOnly" in s && s.adminOnly)).map((s) => {
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

      {admin && (
        <>
          <span aria-hidden className="bg-border mx-1 h-4 w-px" />
          <span className="text-faint mr-0.5 text-[10px] font-medium tracking-wider uppercase">
            Owner
          </span>
          {ADMIN_SECTIONS.map((s) => {
            const href = `${adminBase}${s.path}`;
            const active = pathname.startsWith(href);
            return (
              <Link
                key={s.label}
                href={href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs transition-colors",
                  active
                    ? "bg-secondary text-foreground border-border border font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </Link>
            );
          })}
        </>
      )}
    </nav>
  );
}
