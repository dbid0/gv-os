"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Plus, Wand2 } from "lucide-react";

import {
  addAdjustment,
  createPayout,
  generatePayoutRun,
  markPayoutPaid,
} from "@/app/(app)/accounting/payouts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { PAYOUT_KINDS } from "@/lib/payouts/math";
import { cn } from "@/lib/utils";

const fmtUsd = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    c / 100,
  );

const KIND_LABELS: Record<string, string> = {
  partner: "Partner",
  rep_share: "Rep share",
  retainer: "Retainer",
  processor: "Processor",
  ad_spend: "Ad spend",
  revshare_received: "Rev-share in",
  other: "Other",
};

export interface PayoutRow {
  id: string;
  kind: string;
  label: string;
  baseCents: number;
  totalCents: number;
  status: string;
  adjustments: { id: string; label: string; deltaCents: number }[];
}

const selectClass =
  "border-input bg-transparent h-8 rounded-md border px-2 text-xs shadow-xs outline-none";

export function PayoutsPanel({ month, rows }: { month: string; rows: PayoutRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<string>("partner");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [adjustFor, setAdjustFor] = useState<string | null>(null);
  const [adjustLabel, setAdjustLabel] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");

  const act = (fn: () => Promise<unknown>, done: string) =>
    start(async () => {
      try {
        await fn();
        toast({ tone: "success", title: done });
        router.refresh();
      } catch (e) {
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Action failed.",
        });
      }
    });

  const pendingRows = rows.filter((r) => r.status === "pending");
  const paidRows = rows.filter((r) => r.status === "paid");

  return (
    <div className="space-y-6">
      <Panel
        title={`Add a payout — ${month}`}
        aside={
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            className="gap-1.5"
            onClick={() =>
              act(
                () => generatePayoutRun(month),
                `Generated the ${month} rev-share run`,
              )
            }
          >
            <Wand2 className="size-3.5" /> Generate {month} run
          </Button>
        }
      >
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              () =>
                createPayout({ month, kind, label, amountDollars: amount }).then(() => {
                  setLabel("");
                  setAmount("");
                }),
              "Payout added",
            );
          }}
        >
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={selectClass}
            aria-label="Payout kind"
          >
            {PAYOUT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Who / what — e.g. Gus — August distribution"
            className="h-8 w-72 max-w-full text-xs"
            required
          />
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount ($)"
            className="h-8 w-28 text-xs"
            inputMode="decimal"
            required
          />
          <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
            <Plus className="size-3.5" /> Add
          </Button>
        </form>
      </Panel>

      {[
        { title: "Pending", list: pendingRows, tone: "progress" as const },
        { title: "Paid", list: paidRows, tone: "good" as const },
      ].map((group) => (
        <Panel
          key={group.title}
          title={`${group.title} — ${fmtUsd(group.list.reduce((s, r) => s + r.totalCents, 0))}`}
        >
          {group.list.length === 0 ? (
            <p className="text-faint py-4 text-center text-sm">
              Nothing {group.title.toLowerCase()} this month.
            </p>
          ) : (
            <div className="space-y-2">
              {group.list.map((r) => (
                <div key={r.id} className="bg-card rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <StatusPill tone={group.tone}>{KIND_LABELS[r.kind]}</StatusPill>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {r.label}
                    </span>
                    <span className="numeric text-sm font-semibold tabular-nums">
                      {fmtUsd(r.totalCents)}
                    </span>
                    {r.status === "pending" && (
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAdjustFor(adjustFor === r.id ? null : r.id)}
                          className="text-faint hover:text-foreground rounded-md border px-2 py-1 text-[11px] transition-colors"
                        >
                          adjust
                        </button>
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            act(
                              () => markPayoutPaid(r.id),
                              "Marked paid — backlog row written",
                            )
                          }
                          className="gap-1.5"
                        >
                          <CheckCircle2 className="size-3.5" /> Mark paid
                        </Button>
                      </span>
                    )}
                  </div>
                  {r.adjustments.length > 0 && (
                    <p className="text-faint mt-1.5 text-[11px]">
                      Base {fmtUsd(r.baseCents)}
                      {r.adjustments.map((a) => (
                        <span key={a.id}>
                          {" "}
                          · {a.label}{" "}
                          <span
                            className={cn(
                              "tabular-nums",
                              a.deltaCents < 0 ? "text-destructive" : "text-success",
                            )}
                          >
                            {a.deltaCents < 0 ? "−" : "+"}
                            {fmtUsd(Math.abs(a.deltaCents))}
                          </span>
                        </span>
                      ))}
                    </p>
                  )}
                  {adjustFor === r.id && r.status === "pending" && (
                    <form
                      className="mt-2 flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        act(
                          () =>
                            addAdjustment({
                              payoutId: r.id,
                              label: adjustLabel,
                              deltaDollars: adjustDelta,
                            }).then(() => {
                              setAdjustLabel("");
                              setAdjustDelta("");
                              setAdjustFor(null);
                            }),
                          "Adjustment added",
                        );
                      }}
                    >
                      <Input
                        value={adjustLabel}
                        onChange={(e) => setAdjustLabel(e.target.value)}
                        placeholder="Reason — e.g. bonus, correction"
                        className="h-8 w-56 text-xs"
                        required
                      />
                      <Input
                        value={adjustDelta}
                        onChange={(e) => setAdjustDelta(e.target.value)}
                        placeholder="+/- $"
                        className="h-8 w-24 text-xs"
                        inputMode="decimal"
                        required
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                      >
                        Save
                      </Button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}
