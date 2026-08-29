"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A Notion toggle: a ▶ triangle that rotates to ▼ and reveals its body. The
 * summary is always shown; the children mount only while open. Purely local
 * state — a toggle's open/closed is a reading preference, not saved content.
 */
export function ToggleBlock({
  summary,
  children,
}: {
  summary: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-0.5">
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-faint hover:bg-secondary/60 hover:text-foreground mt-[3px] grid size-6 shrink-0 place-items-center rounded transition-colors"
        >
          <ChevronRight
            className={cn("size-4 transition-transform", open && "rotate-90")}
          />
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 py-[3px] text-left text-[1rem] leading-[1.5]"
        >
          {summary}
        </button>
      </div>
      {open && <div className="mt-0.5 ml-7">{children}</div>}
    </div>
  );
}
