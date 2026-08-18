"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  LifeBuoy,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";

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
      animate={{ width: collapsed ? 72 : 272 }}
      initial={false}
      transition={reduceMotion ? { duration: 0 } : smooth}
      className="bg-sidebar text-sidebar-foreground relative hidden shrink-0 flex-col border-r md:flex"
    >
      {/* Wordmark */}
      <div className="flex h-16 items-center gap-2.5 px-4">
        <div className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold">
          GV
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.15 }}
              className="text-foreground truncate font-semibold tracking-tight"
            >
              Global Ventures
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Workspace switcher. Placeholder until the Clients module exists, but
          the slot belongs here from the start: an agency OS is always operating
          "as" some client, and burying that choice in a menu hides it. */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <button
            type="button"
            disabled
            className="border-border-strong bg-secondary/60 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left"
          >
            <span className="bg-card grid size-8 shrink-0 place-items-center rounded-md border text-xs font-semibold">
              GV
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground block text-[10px] tracking-wider uppercase">
                Workspace
              </span>
              <span className="text-foreground block truncate text-sm font-medium">
                All clients
              </span>
            </span>
            <ChevronRight className="text-faint size-4 shrink-0" />
          </button>
        </div>
      )}

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-2">
        {navigation.map((group) => (
          <div key={group.label}>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-faint mb-1.5 px-2 text-[10px] font-medium tracking-wider uppercase"
                >
                  {group.label}
                </motion.p>
              )}
            </AnimatePresence>

            <ul className="space-y-1">
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

      {/* Primary action, pinned. */}
      <div className="px-3 pb-2">
        <Button
          disabled
          className="press w-full justify-center gap-2"
          size={collapsed ? "icon" : "default"}
        >
          <Plus className="size-4" />
          {!collapsed && <span>Log a deal</span>}
        </Button>
      </div>

      {/* Who you are. */}
      <div className="border-t px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="bg-secondary text-foreground grid size-8 shrink-0 place-items-center rounded-full border text-xs font-semibold">
            D
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="text-foreground block truncate text-sm font-medium">
                Signed out
              </span>
              <span className="text-faint block truncate text-xs">Auth is next</span>
            </span>
          )}
        </div>

        {!collapsed && (
          <div className="text-faint mt-3 flex items-center gap-4 text-xs">
            <span className="hover:text-muted-foreground inline-flex cursor-not-allowed items-center gap-1.5">
              <LifeBuoy className="size-3.5" /> Support
            </span>
            <span className="hover:text-muted-foreground inline-flex cursor-not-allowed items-center gap-1.5">
              <LogOut className="size-3.5" /> Sign out
            </span>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={hydrated ? !collapsed : undefined}
          className="text-faint mt-2 w-full justify-start gap-2"
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
        "relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors",
        active && "text-foreground font-medium",
        !active && !planned && "text-muted-foreground hover:text-foreground",
        planned && "text-faint",
      )}
    >
      {/* The active state is a filled bubble with its own hairline, not a wash.
          It reads as a selected object rather than a highlight. */}
      {active && (
        <motion.span
          layoutId="nav-active"
          transition={reduceMotion ? { duration: 0 } : snappy}
          className="border-border-strong bg-secondary elev-card absolute inset-0 -z-10 rounded-lg border"
        >
          <span className="bg-brand absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full" />
        </motion.span>
      )}

      <item.icon className={cn("size-4 shrink-0", active && "text-brand")} />

      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}

      {!collapsed && planned && (
        <span className="text-faint text-[10px] tracking-wide uppercase">Soon</span>
      )}
      {!collapsed && active && <ChevronRight className="text-faint size-4 shrink-0" />}
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
      <TooltipTrigger render={content} />
      <TooltipContent side="right">
        <p className="font-medium">{item.label}</p>
        <p className="text-muted-foreground text-xs">{item.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
