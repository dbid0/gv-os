"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { navigation, type NavItem } from "@/components/shell/nav-config";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsHydrated, usePersistedBoolean } from "@/lib/client-state";
import { smooth, snappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "gvos.sidebar.collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = usePersistedBoolean(STORAGE_KEY, false);
  const hydrated = useIsHydrated();

  const toggle = () => setCollapsed(!collapsed);

  return (
    <motion.aside
      data-testid="sidebar"
      data-collapsed={collapsed}
      animate={{ width: collapsed ? 68 : 248 }}
      initial={false}
      transition={reduceMotion ? { duration: 0 } : smooth}
      className="bg-sidebar text-sidebar-foreground relative hidden shrink-0 flex-col border-r md:flex"
    >
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-md text-sm font-semibold">
          GV
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.15 }}
              className="truncate text-sm font-semibold tracking-tight"
            >
              Global Ventures
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {navigation.map((group) => (
          <div key={group.label}>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-muted-foreground mb-1 px-2 text-[11px] font-medium tracking-wide uppercase"
                >
                  {group.label}
                </motion.p>
              )}
            </AnimatePresence>

            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    collapsed={collapsed}
                    active={pathname === item.href}
                    reduceMotion={Boolean(reduceMotion)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={hydrated ? !collapsed : undefined}
          className="w-full justify-start gap-2"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
          {!collapsed && <span className="text-xs">Collapse</span>}
        </Button>
      </div>
    </motion.aside>
  );
}

function NavLink({
  item,
  collapsed,
  active,
  reduceMotion,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  reduceMotion: boolean;
}) {
  const planned = item.status === "planned";

  const body = (
    <span
      className={cn(
        "relative flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors",
        active && "text-foreground font-medium",
        !active && !planned && "text-muted-foreground hover:text-foreground",
        planned && "text-muted-foreground/55",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          transition={reduceMotion ? { duration: 0 } : snappy}
          className="bg-accent absolute inset-0 -z-10 rounded-md"
        />
      )}
      <item.icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && planned && (
        <span className="text-muted-foreground/70 ml-auto text-[10px] tracking-wide uppercase">
          Soon
        </span>
      )}
    </span>
  );

  // A nav item that goes nowhere teaches people not to trust the nav, so
  // anything unbuilt is visibly inert rather than a dead link.
  const content = planned ? (
    <span aria-disabled className="block cursor-not-allowed">
      {body}
    </span>
  ) : (
    <Link href={item.href} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  );

  if (!collapsed) return content;

  return (
    <Tooltip>
      {/* Base UI composes with `render`, not Radix's `asChild`. */}
      <TooltipTrigger render={content} />
      <TooltipContent side="right">
        <p className="font-medium">{item.label}</p>
        <p className="text-muted-foreground text-xs">{item.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
