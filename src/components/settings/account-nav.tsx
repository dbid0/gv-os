"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The in-page sub-nav for the account page. Anchors scroll to each section and
 * highlight the one currently in view. The app shell scrolls inside <main>, so
 * scrollIntoView drives that scroller and an IntersectionObserver against the
 * viewport tracks which section is active.
 */

type NavItem = { id: string; label: string };

export function AccountNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const els = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const go = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };

  return (
    <nav className="lg:sticky lg:top-0 lg:self-start">
      <p className="text-faint mb-2 hidden text-[11px] font-medium tracking-wider uppercase lg:block">
        Your account
      </p>
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
        {items.map((i) => (
          <li key={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              onClick={(e) => go(e, i.id)}
              aria-current={active === i.id ? "true" : undefined}
              className={cn(
                "block rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                active === i.id
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
              )}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
