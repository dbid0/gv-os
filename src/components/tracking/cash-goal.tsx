"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";

import { saveMonthlyTarget } from "@/app/(app)/clients/[slug]/actions";

/**
 * The cash goal strip — a monthly target with its progress. The window is
 * ALWAYS this calendar month (goals are monthly), independent of whatever
 * range the hero above is showing; the label says so. The pencil is the only
 * editor and only the admin gets one — a portal viewer sees progress or, with
 * no goal set, nothing at all (an empty prompt would read as our note to
 * ourselves on their page).
 */
export function CashGoalStrip({
  slug,
  monthlyTargetCents,
  mtdCashCents,
  canEdit,
}: {
  slug: string;
  monthlyTargetCents: number | null;
  mtdCashCents: number;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    monthlyTargetCents ? String(Math.round(monthlyTargetCents / 100)) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!monthlyTargetCents && !canEdit) return null;

  const save = () =>
    startTransition(async () => {
      try {
        setError(null);
        await saveMonthlyTarget(slug, value);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the goal.");
      }
    });

  const pct = monthlyTargetCents
    ? Math.min(100, Math.round((mtdCashCents / monthlyTargetCents) * 100))
    : 0;
  const fmt = (c: number) =>
    `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return (
    <section className="card-grad rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-faint flex items-center gap-2 text-[11px] font-medium tracking-wider uppercase">
          Cash goal — this month
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit the monthly cash goal"
              className="text-faint hover:text-foreground transition-colors"
            >
              <Pencil className="size-3" />
            </button>
          )}
        </p>
        {monthlyTargetCents ? (
          <p className="text-muted-foreground text-xs">
            <span className="text-foreground numeric font-medium">
              {fmt(mtdCashCents)}
            </span>{" "}
            of {fmt(monthlyTargetCents)} · {pct}%
          </p>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="25000"
            inputMode="numeric"
            className="bg-secondary/60 text-foreground w-36 rounded-md border px-2.5 py-1.5 text-sm"
            aria-label="Monthly cash goal in dollars"
          />
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="bg-secondary hover:bg-secondary/70 text-foreground press rounded-md border px-2.5 py-1.5 text-xs font-medium"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="text-faint hover:text-foreground text-xs"
          >
            Cancel
          </button>
          {error && <p className="text-warning text-xs">{error}</p>}
        </div>
      ) : monthlyTargetCents ? (
        <div className="bg-secondary/60 mt-2.5 h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-success h-full rounded-full transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <p className="text-muted-foreground mt-1 text-sm">
          No goal set — the pencil sets one.
        </p>
      )}
    </section>
  );
}
