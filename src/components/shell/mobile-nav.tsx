"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { navigation } from "@/components/shell/nav-config";
import { Button } from "@/components/ui/button";
import { smooth, snappy } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Navigation on a phone.
 *
 * The desktop sidebar is `hidden md:flex`, which meant a phone had no way to
 * move around the app at all. This is that missing half.
 *
 * Details that matter on a touch device:
 * - Body scroll locks while the drawer is open, or the page slides behind it.
 * - Navigating closes the drawer. Nothing is more irritating than tapping a
 *   link and having the menu stay put.
 * - Rows are 44px minimum, which is the smallest reliable touch target.
 * - The drawer slides from the left with the same spring as the sidebar, so it
 *   feels like the same object arriving rather than a different component.
 */
export function MobileNav() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  // The drawer remembers WHICH route it was opened on, and is open only while
  // that is still the current route. So navigating closes it as a consequence
  // of the route changing, with no effect and no second render. Nothing is more
  // irritating than tapping a link and having the menu stay put.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn !== null && openedOn === pathname;
  const setOpen = (next: boolean) => setOpenedOn(next ? pathname : null);

  // Lock the page behind the drawer.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes, same as the palette.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenedOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="press md:hidden"
      >
        <Menu className="size-5" />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              aria-hidden
            />

            <motion.nav
              aria-label="Main"
              initial={reduceMotion ? false : { x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={reduceMotion ? { duration: 0 } : smooth}
              className="bg-sidebar absolute inset-y-0 left-0 flex w-[280px] flex-col border-r"
            >
              <div className="flex h-16 items-center justify-between px-4">
                <span className="flex items-center gap-2.5">
                  <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg text-sm font-bold">
                    GV
                  </span>
                  <span className="text-foreground font-semibold tracking-tight">
                    Global Ventures
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close navigation"
                  onClick={() => setOpen(false)}
                  className="press"
                >
                  <X className="size-5" />
                </Button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
                {navigation.map((group) => (
                  <div key={group.label}>
                    <p className="text-faint mb-1.5 px-2 text-[10px] font-medium tracking-wider uppercase">
                      {group.label}
                    </p>
                    <ul className="space-y-1">
                      {group.items.map((item) => {
                        const active = pathname === item.href;
                        const planned = item.status === "planned";

                        const body = (
                          <span
                            className={cn(
                              // 44px minimum touch target.
                              "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm",
                              active && "text-foreground font-medium",
                              !active && !planned && "text-muted-foreground",
                              planned && "text-faint",
                            )}
                          >
                            {active && (
                              <motion.span
                                layoutId="mobile-nav-active"
                                transition={reduceMotion ? { duration: 0 } : snappy}
                                className="border-border-strong bg-secondary absolute inset-0 -z-10 rounded-lg border"
                              >
                                <span className="bg-brand absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full" />
                              </motion.span>
                            )}
                            <item.icon
                              className={cn("size-4 shrink-0", active && "text-brand")}
                            />
                            <span className="flex-1 truncate">{item.label}</span>
                            {planned && (
                              <span className="text-faint text-[10px] tracking-wide uppercase">
                                Soon
                              </span>
                            )}
                          </span>
                        );

                        return (
                          <li key={item.href}>
                            {planned ? (
                              <span aria-disabled className="block">
                                {body}
                              </span>
                            ) : (
                              <Link
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                              >
                                {body}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
