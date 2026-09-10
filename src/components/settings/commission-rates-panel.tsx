"use client";

import { useState, useTransition } from "react";

import { saveRatesAction } from "@/app/(app)/settings/rate-actions";
import { Panel } from "@/components/ui/panel";

export type ClientRatesRow = {
  clientId: string;
  clientName: string;
  setter: string;
  closer: string;
  dm_setter: string;
};

const SEATS = [
  ["setter", "Setter %"],
  ["closer", "Closer %"],
  ["dm_setter", "DM setter %"],
] as const;

/**
 * Default commission rates per offer — the rules half of the payout derive.
 * Empty means UNSET: that seat's commissions render as unknown, never zero,
 * until someone writes a number here. Overrides on individual claims beat
 * these.
 */
export function CommissionRatesPanel({ rows }: { rows: ClientRatesRow[] }) {
  return (
    <Panel
      title="Commission rates"
      aside={
        <span className="text-faint text-xs">
          empty = unset — derives unknown, never zero
        </span>
      }
    >
      <div className="space-y-3">
        {rows.map((row) => (
          <RateRow key={row.clientId} row={row} />
        ))}
      </div>
    </Panel>
  );
}

function RateRow({ row }: { row: ClientRatesRow }) {
  const [values, setValues] = useState({
    setter: row.setter,
    closer: row.closer,
    dm_setter: row.dm_setter,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const res = await saveRatesAction({ clientId: row.clientId, ...values });
      if (!res.ok) setError(res.reason ?? "Could not save.");
      else setSaved(true);
    });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <span className="text-foreground w-36 truncate text-sm font-medium">
        {row.clientName}
      </span>
      {SEATS.map(([key, label]) => (
        <label key={key} className="text-faint text-[11px]">
          {label}
          <input
            value={values[key]}
            onChange={(e) => {
              setValues((v) => ({ ...v, [key]: e.target.value }));
              setSaved(false);
            }}
            placeholder="—"
            inputMode="decimal"
            className="bg-secondary/60 text-foreground mt-0.5 block w-20 rounded-md border px-2 py-1 text-sm"
          />
        </label>
      ))}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="bg-secondary hover:bg-secondary/70 text-foreground press rounded-md border px-2.5 py-1.5 text-xs font-medium"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {saved && <span className="text-success text-xs">Saved</span>}
      {error && <span className="text-warning text-xs">{error}</span>}
    </div>
  );
}
