"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveMonthlyTarget } from "@/app/(app)/clients/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const fmtUsd = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

function TargetForm({
  slug,
  initialCents,
  onDone,
}: {
  slug: string;
  initialCents: number | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = useState(
    initialCents === null ? "" : String(Math.round(initialCents / 100)),
  );
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await saveMonthlyTarget(slug, value);
            toast({ tone: "success", title: "Monthly target saved" });
            onDone?.();
            router.refresh();
          } catch (err) {
            toast({
              tone: "error",
              title: err instanceof Error ? err.message : "Save failed.",
            });
          }
        });
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Target in dollars — e.g. 25000"
        className="h-8 w-56 max-w-full text-xs"
        inputMode="numeric"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

export function TargetPanel({
  slug,
  monthlyTargetCents,
  mtdCashCents,
  monthLabel,
}: {
  slug: string;
  monthlyTargetCents: number | null;
  mtdCashCents: number;
  monthLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const hasTarget = monthlyTargetCents !== null && monthlyTargetCents > 0;
  const pct = hasTarget
    ? Math.round((mtdCashCents / (monthlyTargetCents as number)) * 100)
    : 0;

  return (
    <Panel
      title={`Monthly target — ${monthLabel}`}
      aside={
        hasTarget && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-faint hover:text-foreground text-xs transition-colors"
          >
            change target
          </button>
        ) : undefined
      }
    >
      {!hasTarget || editing ? (
        <div className="space-y-2 py-2">
          <p className="text-faint text-sm">
            Set a cash target for the month and progress tracks itself off the
            reconciled sheet numbers.
          </p>
          <TargetForm
            slug={slug}
            initialCents={monthlyTargetCents}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="numeric text-2xl font-semibold">
              {fmtUsd(mtdCashCents)}
            </span>
            <span className="text-muted-foreground text-sm">
              of {fmtUsd(monthlyTargetCents as number)} collected
            </span>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                pct >= 100 ? "text-success" : "text-muted-foreground",
              )}
            >
              {pct}%
            </span>
          </div>
          <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full",
                pct >= 100 ? "bg-success" : "bg-brand",
              )}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <p className="text-faint text-[11px]">
            Actuals = deals on the Master Finance Sheet closed this month, matched by
            name.
          </p>
        </div>
      )}
    </Panel>
  );
}
