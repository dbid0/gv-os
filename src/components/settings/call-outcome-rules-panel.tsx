"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import {
  createOutcomeRuleAction,
  deleteOutcomeRuleAction,
} from "@/app/(app)/clients/[slug]/outcome-rule-actions";
import { EOC_OUTCOMES } from "@/lib/calls/eoc-form";
import { describeOutcomeRule, type OutcomeRule } from "@/lib/calls/outcome-rules";

const fieldClass =
  "bg-secondary/60 text-foreground mt-0.5 block rounded-md border px-2 py-1.5 text-sm";

/**
 * What filing a call's outcome in GV OS sets off: tag the lead, notify the
 * team, or both. Rules run on reports filed in GV OS (not sheet rows); voiding
 * a report takes its tags back off.
 */
export function CallOutcomeRulesPanel({
  slug,
  rules,
}: {
  slug: string;
  rules: OutcomeRule[];
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<string>("no_show");
  const [tag, setTag] = useState("");
  const [notify, setNotify] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      setErrors([]);
      const res = await createOutcomeRuleAction(slug, { outcome, tag, notify });
      if (!res.ok) {
        setErrors(res.errors);
        return;
      }
      setTag("");
      setNotify(false);
      router.refresh();
    });

  const remove = (id: string) =>
    startTransition(async () => {
      setErrors([]);
      const res = await deleteOutcomeRuleAction(slug, id);
      if (!res.ok) setErrors(res.errors);
      else router.refresh();
    });

  return (
    <div className="space-y-4">
      {rules.length === 0 ? (
        <p className="text-faint text-sm">
          No rules yet. Filing an outcome records the call and nothing else.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="text-sm">{describeOutcomeRule(r)}</span>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={pending}
                aria-label={`Delete rule: ${describeOutcomeRule(r)}`}
                className="text-faint hover:text-destructive p-1"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-faint text-[11px]">
          When a call is filed as
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className={fieldClass}
          >
            {EOC_OUTCOMES.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-faint text-[11px]">
          Tag the lead
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="e.g. rebook"
            maxLength={40}
            className={`${fieldClass} w-36`}
          />
        </label>
        <label className="text-muted-foreground flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          Notify the team
        </label>
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="hover:bg-secondary/70 press mb-0.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          Add rule
        </button>
      </div>
      {errors.length > 0 && (
        <ul className="text-destructive space-y-0.5 text-xs">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
