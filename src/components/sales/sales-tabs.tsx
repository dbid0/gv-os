"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  FileText,
  Inbox,
  Phone,
  Receipt,
  Target,
  Trophy,
  Users,
} from "lucide-react";

import { snappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The Sales section's own sub-navigation — RepVision's IA, as tabs.
 *
 * A link-based tab bar rather than a segmented control, because each view is a
 * real route you can deep-link and refresh on. The active bubble SLIDES between
 * tabs (shared layoutId) so the four views read as one surface, the same motion
 * the sidebar uses for the section itself.
 */

const tabs = [
  { label: "Teams", href: "/sales", icon: Users },
  { label: "Deals", href: "/sales/deals", icon: Receipt },
  { label: "EOD Reports", href: "/sales/eod", icon: FileText },
  { label: "Commissions", href: "/sales/commissions", icon: BarChart3 },
  { label: "Leaderboard", href: "/sales/leaderboard", icon: Trophy },
  { label: "Call Log", href: "/sales/call-log", icon: Phone },
  { label: "Quotas", href: "/sales/quotas", icon: Target },
  { label: "Applications", href: "/sales/applications", icon: Inbox },
  { label: "Templates", href: "/sales/templates", icon: ClipboardList },
];

export function SalesTabs() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label="Sales views"
      className="bg-secondary/60 inline-flex items-center gap-1 rounded-xl border p-1"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            className={cn(
              "press relative inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm transition-colors",
              active
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="sales-tab-active"
                transition={reduceMotion ? { duration: 0 } : snappy}
                className="border-border-strong bg-card elev-card absolute inset-0 -z-10 rounded-lg border"
              />
            )}
            <tab.icon className="size-3.5 shrink-0" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
