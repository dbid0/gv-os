"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ClipboardList,
  Columns3,
  FileText,
  GraduationCap,
  Kanban,
  PhoneCall,
  LayoutGrid,
  Mail,
  Receipt,
  Settings,
  Activity,
  BarChart3,
  Users,
  type LucideIcon,
  Hash,
  Waypoints,
} from "lucide-react";

import { usePersistedRecord } from "@/lib/client-state";
import { cn } from "@/lib/utils";

const GROUPS_KEY = "gvos.wsidebar.groups";

type Item = {
  label: string;
  icon: LucideIcon;
  /** Relative to /w/[slug] unless ownerArea, then relative to /clients/[slug]. */
  path: string;
  adminOnly?: boolean;
  ownerArea?: boolean;
};

/**
 * The sub-account nav — the reference product's grouping, our sections.
 * Inside a client, the SIDEBAR is that client's world; the admin shell's
 * sidebar belongs to the agency. Owner-only surfaces ride in the same
 * groups (one door), marked by gating rather than a separate bar.
 */
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Tracking",
    items: [
      { label: "Dashboard", icon: LayoutGrid, path: "" },
      { label: "Tracking", icon: Activity, path: "/tracking", adminOnly: true },
      { label: "Numbers", icon: Hash, path: "/numbers", adminOnly: true },
      {
        label: "Accounting",
        icon: Receipt,
        path: "/accounting",
        adminOnly: true,
        ownerArea: true,
      },
    ],
  },
  {
    label: "Leads",
    items: [
      { label: "CRM", icon: Kanban, path: "/crm" },
      { label: "Leads", icon: Users, path: "/leads" },
      // GV-internal: a rep-level "who's where in the funnel" board is not
      // something to hand a client inside their own portal (same call as
      // Tracking below), so it is admin-only in both nav and page gate.
      { label: "Pipeline", icon: Columns3, path: "/pipeline", adminOnly: true },
      { label: "Calls", icon: PhoneCall, path: "/calls", adminOnly: true },
      { label: "Sources", icon: Waypoints, path: "/sources", adminOnly: true },
      { label: "Sales", icon: BarChart3, path: "/sales" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Email", icon: Mail, path: "/email" },
      { label: "Students", icon: GraduationCap, path: "/students" },
      { label: "Onboarding", icon: ClipboardList, path: "/onboarding" },
      {
        label: "Docs",
        icon: FileText,
        path: "/workspace",
        adminOnly: true,
        ownerArea: true,
      },
      {
        label: "Setup",
        icon: Settings,
        path: "/setup",
        adminOnly: true,
        ownerArea: true,
      },
    ],
  },
];

export function WorkspaceSidebar({
  slug,
  admin,
  clientPreview,
  identity,
}: {
  slug: string;
  admin: boolean;
  clientPreview: boolean;
  /** The logo/name block, rendered by the server layout (upload lives there). */
  identity: ReactNode;
}) {
  const pathname = usePathname();
  const [folded, setFolded] = usePersistedRecord(GROUPS_KEY);
  const base = `/w/${slug}`;
  const ownerBase = `/clients/${slug}`;

  const hrefOf = (item: Item) =>
    item.ownerArea ? `${ownerBase}${item.path}` : `${base}${item.path}`;
  const isActive = (item: Item) => {
    const href = hrefOf(item);
    return item.path === "" ? pathname === base : pathname.startsWith(href);
  };

  return (
    <aside className="bg-sidebar hidden w-[248px] shrink-0 flex-col border-r md:flex">
      {/* Back to the agency — admins only; a client's world has no outside. */}
      {!clientPreview && (
        <div className="px-3 pt-3">
          <Link
            href="/dashboard"
            prefetch={false}
            className="text-faint hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Admin
          </Link>
        </div>
      )}

      {/* The client identity block — their mark, their name, their world. */}
      <div className="border-b px-3 py-3">{identity}</div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {GROUPS.map((group) => {
          const items = group.items.filter((i) => admin || !i.adminOnly);
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() =>
                  setFolded({ ...folded, [group.label]: !folded[group.label] })
                }
                aria-expanded={!folded[group.label]}
                className="text-muted-foreground hover:text-foreground mb-1 flex w-full items-center gap-1 px-2 text-[10.5px] font-semibold tracking-[0.09em] uppercase transition-colors"
              >
                <ChevronDown
                  className={cn(
                    "size-3 shrink-0 transition-transform",
                    folded[group.label] && "-rotate-90",
                  )}
                />
                {group.label}
              </button>
              <ul className={cn("space-y-0.5", folded[group.label] && "hidden")}>
                {items.map((item) => {
                  const active = isActive(item);
                  return (
                    <li key={item.label}>
                      <Link
                        href={hrefOf(item)}
                        prefetch={false}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                          active
                            ? "bg-secondary text-foreground border font-medium"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <item.icon
                          className={cn("size-4 shrink-0", active && "text-brand")}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.ownerArea && (
                          <span className="text-faint text-[9px] tracking-wide uppercase">
                            Owner
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
