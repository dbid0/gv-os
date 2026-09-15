"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  LogOut,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from "lucide-react";

import { navigation, type NavItem } from "@/components/shell/nav-config";
import { ClientLogo } from "@/components/clients/client-logo";
import { canAccessRoute, type Role } from "@/lib/auth/roles";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { signOut } from "@/lib/auth/actions";
import type { ShellUser } from "@/lib/auth/user";
import {
  useIsHydrated,
  usePersistedBoolean,
  usePersistedRecord,
} from "@/lib/client-state";
import { smooth, snappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "gvos.sidebar.collapsed";
const GROUPS_KEY = "gvos.sidebar.groups";

export function Sidebar({
  user,
  previewRole = null,
  roster,
}: {
  /** DB-backed roster from the layout — a signed client appears here without
   * anyone editing a file. */
  roster: {
    slug: string;
    name: string;
    owner: string;
    accent: string;
    hasLogo?: boolean;
  }[];
  user: ShellUser | null;
  previewRole?: Role | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Warm the switcher's targets on intent, not on load (punch-list 20 was an
  // on-mount useEffect here — it fired a full server render of every target
  // on EVERY page mount and saturated the DB pool). Menu content only mounts
  // on open, so Link's viewport prefetch never fires for these until it's
  // too late to matter — instead we prefetch as soon as the trigger shows
  // hover/focus intent, once per mount, so the switcher still feels instant
  // when actually opened but nothing fires on initial page load.
  const warmedSwitcherRef = useRef(false);
  const warmSwitcherTargets = () => {
    if (warmedSwitcherRef.current) return;
    warmedSwitcherRef.current = true;
    router.prefetch("/clients");
    router.prefetch("/dashboard");
    router.prefetch("/sales/teams/new");
    for (const client of roster) router.prefetch(`/w/${client.slug}`);
  };
  // Preview shells (v2 §6): a role only sees nav it can actually open —
  // no dead links that bounce off the middleware.
  const visibleNavigation =
    previewRole && previewRole !== "admin"
      ? navigation
          .map((group) => ({
            ...group,
            items: group.items.filter((item) => canAccessRoute(previewRole, item.href)),
          }))
          .filter((group) => group.items.length > 0)
      : navigation;
  // Longest matching href wins, so a parent item (/team) doesn't stay lit when a
  // more specific sibling (e.g. /team/work) is the real match.
  const activeHref =
    visibleNavigation
      .flatMap((g) => g.items)
      .filter((it) => pathname === it.href || pathname.startsWith(`${it.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
  const activeClient =
    roster.find((c) => pathname.startsWith(`/clients/${c.slug}`)) ?? null;
  const reduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = usePersistedBoolean(STORAGE_KEY, false);
  const hydrated = useIsHydrated();
  const [folded, setFolded] = usePersistedRecord(GROUPS_KEY);
  const toggleGroup = (label: string) =>
    setFolded({ ...folded, [label]: !folded[label] });

  const toggle = () => setCollapsed(!collapsed);

  return (
    <motion.aside
      data-testid="sidebar"
      data-collapsed={collapsed}
      animate={{ width: collapsed ? 72 : 248 }}
      initial={false}
      transition={reduceMotion ? { duration: 0 } : smooth}
      className="bg-sidebar text-sidebar-foreground relative hidden shrink-0 flex-col border-r md:flex"
    >
      {/* Wordmark — the globe-V mark, which breathes a faint brand glow and
          leans in on hover. Links home. */}
      <Link
        href="/dashboard"
        aria-label="Global Ventures"
        prefetch={false}
        className="group flex h-16 items-center gap-2.5 px-4"
      >
        <motion.span
          whileHover={reduceMotion ? undefined : { scale: 1.07 }}
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          transition={snappy}
          className="relative grid size-8 shrink-0 place-items-center"
        >
          <span
            aria-hidden
            className="logo-glow pointer-events-none absolute -inset-1.5 rounded-full blur-md"
          />
          <Image
            src="/brand/gv-mark-white.png"
            alt=""
            width={32}
            height={32}
            priority
            className="relative size-8 object-contain"
          />
        </motion.span>
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
      </Link>

      {/* Workspace switcher (v2 §1): clicking a client ENTERS their branded
          workspace (/w/slug — the whole app re-skins and re-scopes); All
          clients stays the admin aggregate. */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              onMouseEnter={warmSwitcherTargets}
              onFocus={warmSwitcherTargets}
              className="border-border-strong bg-secondary/60 hover:border-brand/40 flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors"
            >
              {activeClient ? (
                <ClientLogo
                  hasLogo={activeClient.hasLogo}
                  slug={activeClient.slug}
                  name={activeClient.name}
                  accent={activeClient.accent}
                  size={32}
                  radius="md"
                />
              ) : (
                <span className="bg-card grid size-8 shrink-0 place-items-center rounded-md border">
                  <Image
                    src="/brand/gv-mark-white.png"
                    alt=""
                    width={20}
                    height={20}
                    className="size-5 object-contain"
                  />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="text-muted-foreground block text-[10px] tracking-wider uppercase">
                  Workspace
                </span>
                <span className="text-foreground block truncate text-sm font-medium">
                  {activeClient?.name ?? "All clients"}
                </span>
              </span>
              <ChevronRight className="text-faint size-4 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                render={<Link href="/clients" prefetch={false} />}
                className="gap-2"
              >
                <span className="bg-card grid size-6 place-items-center rounded-md border">
                  <Image
                    src="/brand/gv-mark-white.png"
                    alt=""
                    width={16}
                    height={16}
                    className="size-4 object-contain"
                  />
                </span>
                All clients
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {roster.map((client) => (
                <DropdownMenuItem
                  key={client.slug}
                  render={<Link href={`/w/${client.slug}`} prefetch={false} />}
                  className="gap-2"
                >
                  <ClientLogo
                    hasLogo={client.hasLogo}
                    slug={client.slug}
                    name={client.name}
                    accent={client.accent}
                    size={24}
                    radius="md"
                  />
                  <span className="min-w-0 flex-1 truncate">{client.name}</span>
                  <span className="text-faint text-[10px]">{client.owner}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={<Link href="/sales/teams/new" prefetch={false} />}
                className="text-brand gap-2"
              >
                <span className="border-brand/40 bg-brand-soft/50 grid size-6 place-items-center rounded-md border">
                  <Plus className="size-3.5" />
                </span>
                Add new team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Search — looks like an input, IS the palette. */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("gvos:open-palette"))}
            className="text-faint hover:text-muted-foreground bg-secondary/40 mt-2 flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[13px] transition-colors"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="flex-1">Search…</span>
            <kbd className="text-faint text-[10px]">⌘K</kbd>
          </button>
        </div>
      )}

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-2">
        {visibleNavigation.map((group) => (
          <div key={group.label}>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
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
                </motion.button>
              )}
            </AnimatePresence>

            <ul
              className={cn(
                "space-y-0.5",
                !collapsed && folded[group.label] && "hidden",
              )}
            >
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    collapsed={collapsed}
                    active={item.href === activeHref}
                    reduceMotion={Boolean(reduceMotion)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Primary action, pinned. Admin/agency logs to the finance sheet; a rep
          logs their own deal into the sales module. */}
      <div className="px-3 pb-2">
        <Link
          href={
            previewRole === "sales_rep" || previewRole === "sales_manager"
              ? "/sales/deals/new"
              : "/accounting/log-deal"
          }
          prefetch={false}
          className={cn(
            buttonVariants({ size: collapsed ? "icon" : "default" }),
            "press w-full justify-center gap-2",
          )}
        >
          <Plus className="size-4" />
          {!collapsed && <span>Log a deal</span>}
        </Link>
      </div>

      {/* Who you are — one quiet row; email, account and sign-out live in the
          menu above it, so the sidebar floor stays clean. */}
      <div className="border-t px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="hover:bg-secondary/60 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors">
            <span className="bg-secondary text-foreground grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold">
              {user?.initial ?? "?"}
            </span>
            {!collapsed && (
              <span className="text-foreground min-w-0 flex-1 truncate text-[13px] font-medium">
                {user?.name ?? "Signed out"}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-foreground truncate text-sm font-semibold">
                {user?.name ?? "Signed out"}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {user?.email ?? "No session"}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={<Link href="/settings" prefetch={false} />}
              className="gap-2"
            >
              <CircleUserRound className="size-4" /> Account
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={signOut}>
              <DropdownMenuItem
                nativeButton
                render={<button type="submit" className="w-full" />}
                className="gap-2"
              >
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={hydrated ? !collapsed : undefined}
          className="text-faint mt-1 w-full justify-start gap-2"
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
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
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
          className="border-border-strong bg-secondary elev-card absolute inset-0 -z-10 rounded-md border"
        >
          <span className="bg-brand absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full" />
        </motion.span>
      )}

      <item.icon className={cn("size-4 shrink-0", active && "text-brand")} />

      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}

      {!collapsed && planned && (
        <span className="text-faint text-[10px] tracking-wide uppercase">Soon</span>
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
    <Link href={item.href} prefetch={false} aria-current={active ? "page" : undefined}>
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
