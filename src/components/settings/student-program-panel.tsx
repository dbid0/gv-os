"use client";

import { useState, useTransition } from "react";

import { saveStudentProgramAction } from "@/app/(app)/clients/[slug]/program-actions";

const inputClass =
  "bg-secondary/60 text-foreground mt-0.5 block w-32 rounded-md border px-2 py-1.5 text-sm";

/**
 * Who counts as a student on this offer, and how long the program runs. Both
 * optional: blank minimum = any payment makes a student; blank length =
 * open-ended, no "Program complete" column.
 */
export function StudentProgramPanel({
  slug,
  minPaymentDollars,
  lengthWeeks,
}: {
  slug: string;
  minPaymentDollars: string;
  lengthWeeks: string;
}) {
  const [min, setMin] = useState(minPaymentDollars);
  const [weeks, setWeeks] = useState(lengthWeeks);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setErrors([]);
      setSaved(false);
      const res = await saveStudentProgramAction(slug, {
        minPayment: min,
        lengthWeeks: weeks,
      });
      if (!res.ok) setErrors(res.errors);
      else setSaved(true);
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-faint text-[11px]">
          Student minimum ($)
          <input
            value={min}
            onChange={(e) => {
              setMin(e.target.value);
              setSaved(false);
            }}
            placeholder="any payment"
            inputMode="decimal"
            className={inputClass}
          />
        </label>
        <label className="text-faint text-[11px]">
          Program length (weeks)
          <input
            value={weeks}
            onChange={(e) => {
              setWeeks(e.target.value);
              setSaved(false);
            }}
            placeholder="open-ended"
            inputMode="numeric"
            className={inputClass}
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-secondary hover:bg-secondary/70 text-foreground press rounded-md border px-2.5 py-1.5 text-xs font-medium"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-success text-xs">Saved</span>}
      </div>
      {errors.length > 0 && (
        <ul className="text-warning space-y-0.5 text-xs">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
