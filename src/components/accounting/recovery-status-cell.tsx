"use client";

import { useState, useTransition } from "react";

import { setRecoveryStatusAction } from "@/app/(app)/accounting/recovery/actions";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import type {
  EffectiveRecoveryStatus,
  RecoveryDisposition,
} from "@/lib/payments/recovery";

/**
 * The per-row disposition control on the recovery inbox. A quiet status pill
 * plus a select an admin uses to move the row through chasing → recovered →
 * written off (or back to open). It only ever sets operational state — it never
 * retries a charge and never touches a money total.
 */

const STATUS_LABEL: Record<EffectiveRecoveryStatus, string> = {
  open: "Needs chasing",
  chasing: "Chasing",
  recovered: "Recovered",
  written_off: "Written off",
};

const STATUS_TONE: Record<EffectiveRecoveryStatus, StatusTone> = {
  open: "danger",
  chasing: "progress",
  recovered: "good",
  written_off: "muted",
};

// The select's value — "" is "open" (no disposition set).
type SelectValue = RecoveryDisposition | "";

export function RecoveryStatusCell({
  paymentEventId,
  status,
  disposition,
}: {
  paymentEventId: string;
  status: EffectiveRecoveryStatus;
  disposition: RecoveryDisposition | null;
}) {
  const [value, setValue] = useState<SelectValue>(disposition ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (next: SelectValue) => {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const res = await setRecoveryStatusAction({
        paymentEventId,
        disposition: next,
      });
      if (!res.ok) {
        setValue(previous);
        setError(res.reason ?? "Could not update.");
      }
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-warning text-[11px]">{error}</span>}
      <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value as SelectValue)}
        aria-label="Set recovery status"
        className="bg-secondary/60 text-foreground rounded border px-1.5 py-1 text-xs disabled:opacity-50"
      >
        <option value="">Open</option>
        <option value="chasing">Chasing</option>
        <option value="recovered">Recovered</option>
        <option value="written_off">Written off</option>
      </select>
    </div>
  );
}
