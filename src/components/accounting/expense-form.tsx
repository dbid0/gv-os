"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import { addExpense } from "@/app/(app)/accounting/expenses/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { EXPENSE_CATEGORIES } from "@/lib/accounting/expense-categories";

const selectClass =
  "border-input bg-transparent h-8 rounded-md border px-2 text-xs shadow-xs outline-none";

export function ExpenseForm({ today }: { today: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>("software");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await addExpense({
              occurredOn: date,
              label,
              category,
              amountDollars: amount,
            });
            toast({ tone: "success", title: "Expense recorded — backlog row written" });
            setLabel("");
            setAmount("");
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
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="What — e.g. Vercel Pro"
        className="h-8 w-56 max-w-full text-xs"
        required
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className={selectClass}
        aria-label="Category"
      >
        {EXPENSE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <Input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount ($)"
        className="h-8 w-28 text-xs"
        inputMode="decimal"
        required
      />
      <Input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="h-8 w-36 text-xs"
        required
      />
      <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
        <Plus className="size-3.5" /> Record
      </Button>
    </form>
  );
}
