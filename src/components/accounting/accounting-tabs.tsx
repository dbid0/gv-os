"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Landmark } from "lucide-react";

import { snappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Accounting's two big lenses (Daniel's model): the AGENCY side — GV's own
 * book, where setup fees, processor fees, net-after-fees, payouts, and the
 * rev-share we EARN from clients all live — and the GROSS CLIENTS side, the
 * full client-layer revenue. The agency detail views hang off the agency tab.
 */

const primary = [
  { label: "Agency", href: "/accounting", icon: Landmark },
  { label: "Gross — clients", href: "/accounting/clients", icon: Building2 },
];

// Agency-side detail views (all GV's own book).
const detail = [
  { label: "Transactions", href: "/accounting/transactions" },
  { label: "Rev-share", href: "/accounting/revshare" },
  { label: "Payouts", href: "/accounting/payouts" },
  { label: "A/R", href: "/accounting/ar" },
  { label: "Expenses", href: "/accounting/expenses" },
];

export function AccountingTabs() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const onClients = pathname.startsWith("/accounting/clients");

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Accounting side"
        className="bg-secondary/60 inline-flex items-center gap-1 rounded-xl border p-1"
      >
        {primary.map((tab) => {
          const active = tab.href === "/accounting" ? !onClients : onClients;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className={cn(
                "press relative inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm transition-colors",
                active
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="accounting-tab-active"
                  transition={reduceMotion ? { duration: 0 } : snappy}
                  className="border-border-strong bg-card elev-card absolute inset-0 -z-10 rounded-lg border"
                />
              )}
              <tab.icon className="size-4 shrink-0" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Agency detail views — only relevant on the agency side. */}
      {!onClients && (
        <div className="flex flex-wrap items-center gap-1.5">
          {detail.map((d) => {
            // Match sub-routes too (e.g. /accounting/revshare/statement keeps the
            // Rev-share chip lit), without over-matching a sibling.
            const active = pathname === d.href || pathname.startsWith(`${d.href}/`);
            return (
              <Link
                key={d.href}
                href={d.href}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-brand/40 bg-brand-soft/60 text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )}
              >
                {d.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
