"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Megaphone, Plus } from "lucide-react";

import { addAdSpend } from "@/app/(app)/clients/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/metric";
import { useToast } from "@/components/ui/toast";
import { cents } from "@/lib/money";
import type { AdSpendEntry } from "@/lib/revshare/ad-spend-query";

/**
 * Record an offer's ad spend — deducted from cash-after-fees before an
 * "X% after ad spend" rev-share is rated (Racks = 10% after ad spend). Entries
 * are append-only; a correction is a new negative row.
 */
export function AdSpendField({
  slug,
  entries,
  totalCents,
}: {
  slug: string;
  entries: AdSpendEntry[];
  totalCents: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const add = () =>
    start(async () => {
      try {
        await addAdSpend(slug, date, amount, note);
        toast({ tone: "success", title: "Ad spend recorded" });
        setAmount("");
        setNote("");
        router.refresh();
      } catch (e) {
        toast({
          tone: "error",
          title: e instanceof Error ? e.message : "Could not save.",
        });
      }
    });

  return (
    <div className="bg-card space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <span className="border-brand/40 bg-brand-soft/50 text-brand grid size-9 shrink-0 place-items-center rounded-lg border">
          <Megaphone className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Ad spend</p>
          <p className="text-faint text-xs">
            Deducted from cash after fees before an &ldquo;after ad spend&rdquo;
            rev-share is rated.
          </p>
        </div>
        <div className="text-right">
          <p className="text-faint text-[11px] tracking-wider uppercase">Total</p>
          <p className="numeric font-semibold tabular-nums">
            <Money amount={cents(totalCents)} />
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto text-xs"
        />
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="$ amount"
          className="w-28 font-mono text-xs"
        />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="note (optional)"
          className="min-w-0 flex-1 text-xs"
        />
        <Button onClick={add} disabled={pending} className="gap-1.5">
          <Plus className="size-3.5" /> {pending ? "Saving…" : "Add"}
        </Button>
      </div>

      {entries.length > 0 && (
        <div className="max-h-40 overflow-y-auto text-xs">
          <table className="w-full">
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t first:border-0">
                  <td className="text-muted-foreground py-1.5 pr-3 whitespace-nowrap">
                    {e.occurredOn}
                  </td>
                  <td className="text-muted-foreground py-1.5 pr-3">{e.note ?? ""}</td>
                  <td className="numeric py-1.5 text-right tabular-nums">
                    <Money amount={cents(e.amountCents)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
