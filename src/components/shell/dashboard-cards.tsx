"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Plus, X } from "lucide-react";

import { saveDashboardCards } from "@/app/(app)/dashboard/cards-actions";
import { useToast } from "@/components/ui/toast";
import {
  DASHBOARD_CARD_IDS,
  DASHBOARD_CARD_META,
  type DashboardCardId,
} from "@/lib/dashboard-cards";
import { cn } from "@/lib/utils";

/**
 * The editable dashboard (Whop's Add-Charts pattern, Daniel's ask): every
 * card removable on hover, an Add panel for the rest, the layout persisted
 * per user. Server renders the card content; this shell only arranges it.
 */
export function DashboardCards({
  active,
  slots,
}: {
  active: DashboardCardId[];
  slots: Partial<Record<DashboardCardId, ReactNode>>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  // Optimistic layout: the UI moves instantly, the pref catches up.
  const [cards, setCards] = useState<DashboardCardId[]>(active);

  const persist = (next: DashboardCardId[]) => {
    setCards(next);
    start(async () => {
      try {
        await saveDashboardCards(next);
        router.refresh();
      } catch (e) {
        setCards(active);
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Could not save layout.",
        });
      }
    });
  };

  const available = DASHBOARD_CARD_IDS.filter((id) => !cards.includes(id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-faint text-[11px] font-medium tracking-wider uppercase">
          Your board
        </p>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className="text-muted-foreground hover:text-foreground hover:border-brand/40 flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors"
          >
            <Plus className="size-3.5" /> Add cards
          </button>
          {adding && (
            <div className="gv-pop-in bg-card absolute top-full right-0 z-40 mt-2 w-64 rounded-xl border p-2 shadow-xl">
              {available.length === 0 ? (
                <p className="text-faint px-2 py-3 text-center text-xs">
                  Everything is on the board.
                </p>
              ) : (
                available.map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      persist([...cards, id]);
                      setAdding(false);
                    }}
                    className="hover:bg-secondary/60 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors"
                  >
                    <Plus className="text-brand mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">
                        {DASHBOARD_CARD_META[id].title}
                      </span>
                      <span className="text-faint block text-[11px]">
                        {DASHBOARD_CARD_META[id].detail}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {cards.map((id) =>
        slots[id] ? (
          <div key={id} className="group/card relative">
            <button
              type="button"
              disabled={pending}
              onClick={() => persist(cards.filter((c) => c !== id))}
              aria-label={`Remove ${DASHBOARD_CARD_META[id].title}`}
              className={cn(
                "bg-card text-faint hover:text-destructive absolute -top-2 -right-2 z-10 grid size-6 place-items-center rounded-full border opacity-0 shadow-sm transition-all",
                "group-hover/card:opacity-100",
              )}
            >
              <X className="size-3" />
            </button>
            {slots[id]}
          </div>
        ) : null,
      )}
    </div>
  );
}
