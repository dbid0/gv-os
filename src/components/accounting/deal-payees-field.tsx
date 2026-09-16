"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { splitDeal, type DealPayee } from "@/lib/accounting/deal-split";

/**
 * Additional payouts on a deal — a third party owed a cut before the partners
 * split the rest ("10% to Jaiden", "owe Gerard $313.39").
 *
 * These used to be a sentence in the notes that nothing could total. The live
 * breakdown underneath is the point of the whole field: you can see net, each
 * claim, and what the partners are actually left with, before you save.
 */

export interface PayeeDraft {
  name: string;
  kind: "fixed" | "percent";
  /** Dollars when fixed, whole percent when percent. As typed. */
  amount: string;
}

export const emptyPayee = (): PayeeDraft => ({ name: "", kind: "percent", amount: "" });

/** Drafts the reader has actually filled in, as split-engine input. */
export function toDealPayees(drafts: PayeeDraft[]): DealPayee[] {
  return drafts
    .filter((d) => d.name.trim() !== "" && d.amount.trim() !== "")
    .map((d) => ({
      name: d.name.trim(),
      kind: d.kind,
      // Both scale by 100, for different reasons: dollars → cents, and whole
      // percent → basis points. Same arithmetic, not the same unit.
      value:
        d.kind === "fixed"
          ? Math.round(Number(d.amount) * 100) // 313.39 → 31339 cents
          : Math.round(Number(d.amount) * 100), // 10 → 1000 bps
    }));
}

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function DealPayeesField({
  payees,
  onChange,
  netCents,
  partners,
}: {
  payees: PayeeDraft[];
  onChange: (next: PayeeDraft[]) => void;
  /** The deal's net so far (cash − fee), for the live breakdown. */
  netCents: number;
  partners: { name: string; bps: number }[];
}) {
  const set = (i: number, patch: Partial<PayeeDraft>) =>
    onChange(payees.map((p, n) => (n === i ? { ...p, ...patch } : p)));

  const split = splitDeal(netCents, toDealPayees(payees), partners);

  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted-foreground text-xs">Additional payouts</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onChange([...payees, emptyPayee()])}
        >
          <Plus className="size-3" /> Add payout
        </Button>
      </div>

      {payees.length > 0 && (
        <div className="mb-3 space-y-2">
          {payees.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                value={p.name}
                onChange={(e) => set(i, { name: e.target.value })}
                placeholder="Who is owed"
                className="max-w-[14rem] flex-1"
              />
              <select
                className="border-border-strong bg-secondary/40 h-9 rounded-md border px-2 text-sm"
                value={p.kind}
                onChange={(e) => set(i, { kind: e.target.value as PayeeDraft["kind"] })}
              >
                <option value="percent">% of net</option>
                <option value="fixed">$ fixed</option>
              </select>
              <Input
                value={p.amount}
                onChange={(e) => set(i, { amount: e.target.value })}
                placeholder={p.kind === "percent" ? "10" : "313.39"}
                inputMode="decimal"
                className="max-w-[7rem]"
              />
              <button
                type="button"
                aria-label={`Remove ${p.name || "payout"}`}
                onClick={() => onChange(payees.filter((_, n) => n !== i))}
                className="text-faint hover:text-foreground p-1"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* The breakdown, so the deal structure is readable before it is saved. */}
      {netCents > 0 && (
        <div className="bg-secondary/30 rounded-lg border p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Net after fees</span>
            <span className="tabular-nums">{usd(split.netCents)}</span>
          </div>
          {split.payees.map((p, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-muted-foreground">− {p.name}</span>
              <span className="tabular-nums">{usd(p.cents)}</span>
            </div>
          ))}
          {split.payees.length > 0 && (
            <div className="mt-1 flex justify-between border-t pt-1 font-medium">
              <span>Left to split</span>
              <span className="tabular-nums">{usd(split.remainingCents)}</span>
            </div>
          )}
          {split.partners.map((p) => (
            <div key={p.name} className="flex justify-between">
              <span className="text-muted-foreground">{p.name}</span>
              <span className="tabular-nums">{usd(p.cents)}</span>
            </div>
          ))}
          {split.overdrawn && (
            <p className="text-warning mt-2 text-xs">
              These payouts come to more than the deal made.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
