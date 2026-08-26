"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Check } from "lucide-react";

import { updateSettings } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import type { OrgSettings } from "@/lib/settings";

const selectClass =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="text-faint block text-xs">{hint}</span>}
    </label>
  );
}

export function SettingsForm({ settings }: { settings: OrgSettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [currency, setCurrency] = useState(settings.currency);
  const [revenueGoal, setRevenueGoal] = useState(
    settings.monthlyRevenueGoalCents
      ? String(settings.monthlyRevenueGoalCents / 100)
      : "",
  );
  const [showGoal, setShowGoal] = useState(
    settings.showRateGoalPct == null ? "" : String(settings.showRateGoalPct),
  );
  const [closeGoal, setCloseGoal] = useState(
    settings.closeRateGoalPct == null ? "" : String(settings.closeRateGoalPct),
  );

  const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));

  const { toast } = useToast();

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      try {
        await updateSettings({
          currency,
          monthlyRevenueGoal: revenueGoal,
          showRateGoalPct: num(showGoal),
          closeRateGoalPct: num(closeGoal),
        });
        setSaved(true);
        toast({ tone: "success", title: "Settings saved" });
        router.refresh();
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not save.");
        toast({ tone: "error", title: "Couldn't save settings" });
      }
    });
  }

  return (
    <Panel
      title="Goals & targets"
      aside={<span className="text-faint text-xs">Targets, never ledger money</span>}
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display currency">
            <select
              className={selectClass}
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setSaved(false);
              }}
            >
              <option value="USD">$ USD — US Dollar</option>
              <option value="EUR">€ EUR — Euro</option>
              <option value="GBP">£ GBP — British Pound</option>
              <option value="CAD">$ CAD — Canadian Dollar</option>
              <option value="AUD">$ AUD — Australian Dollar</option>
            </select>
          </Field>
          <Field label="Monthly revenue goal ($)">
            <Input
              value={revenueGoal}
              onChange={(e) => {
                setRevenueGoal(e.target.value);
                setSaved(false);
              }}
              inputMode="decimal"
              placeholder="100000"
            />
          </Field>
          <Field
            label="Show rate goal (%)"
            hint="(Calls taken − no shows) ÷ calls taken"
          >
            <Input
              value={showGoal}
              onChange={(e) => {
                setShowGoal(e.target.value);
                setSaved(false);
              }}
              inputMode="decimal"
              placeholder="70"
            />
          </Field>
          <Field label="Close rate goal (%)" hint="Deals ÷ shows">
            <Input
              value={closeGoal}
              onChange={(e) => {
                setCloseGoal(e.target.value);
                setSaved(false);
              }}
              inputMode="decimal"
              placeholder="30"
            />
          </Field>
        </div>

        {err && <p className="text-destructive text-xs">{err}</p>}

        <div className="flex items-center gap-3 border-t pt-4">
          <Button type="submit" disabled={pending} className="gap-2">
            {saved && !pending ? (
              <>
                <Check className="size-3.5" /> Saved
              </>
            ) : pending ? (
              "Saving…"
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
