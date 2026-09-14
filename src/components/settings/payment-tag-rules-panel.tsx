"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";

import {
  deleteTagRuleAction,
  saveTagRuleAction,
  toggleTagRuleAction,
} from "@/app/(app)/clients/[slug]/tag-rule-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { cents, formatUSD } from "@/lib/money";
import type {
  TagRulePanelRow,
  TagRulesPanelData,
} from "@/lib/tracking/tag-rules-panel";
import type { TagRuleInput } from "@/lib/tracking/tag-rules";
import { cn } from "@/lib/utils";

const FIELD_OPTIONS = [
  { value: "label", label: "Label (what was bought)" },
  { value: "provider", label: "Provider" },
  { value: "kind", label: "Kind (charge / refund)" },
  { value: "email", label: "Payer email" },
  { value: "amount_cents", label: "Amount" },
] as const;

const TEXT_OPS = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "is" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
] as const;

const AMOUNT_OPS = [
  { value: "amount_eq", label: "is exactly" },
  { value: "amount_gte", label: "is at least" },
  { value: "amount_lte", label: "is at most" },
] as const;

/** The one effect a rule has on dashboard money, as the editor offers it. */
type Effect = "tag_only" | "not_revenue" | "hide" | "exclude";

const EFFECTS: { value: Effect; label: string; detail: string }[] = [
  {
    value: "tag_only",
    label: "Tag only",
    detail: "Label it. Every figure stays exactly as it is.",
  },
  {
    value: "not_revenue",
    label: "Not revenue",
    detail: "Money that arrived but isn't a sale, like a fee pass-through.",
  },
  {
    value: "hide",
    label: "Hide from dashboards",
    detail: "Kept in the ledger and tracking, left out of dashboard cash.",
  },
  {
    value: "exclude",
    label: "Exclude everywhere",
    detail: "Test charges and internal transfers. Out of every dashboard figure.",
  },
];

const inputClass =
  "bg-secondary/60 text-foreground mt-0.5 block w-full rounded-md border px-2 py-1.5 text-sm";

function effectOf(rule: TagRulePanelRow): Effect {
  if (rule.exclude) return "exclude";
  if (rule.hideFromDashboard) return "hide";
  if (!rule.countsAsRevenue) return "not_revenue";
  return "tag_only";
}

function effectLabel(effect: Effect): string {
  return EFFECTS.find((e) => e.value === effect)!.label;
}

type Draft = {
  tag: string;
  matchField: string;
  matchOp: string;
  matchValue: string;
  effect: Effect;
  excludeFromAov: boolean;
  countsAsOptin: boolean;
  sortOrder: string;
  active: boolean;
};

const blankDraft = (): Draft => ({
  tag: "",
  matchField: "label",
  matchOp: "contains",
  matchValue: "",
  effect: "tag_only",
  excludeFromAov: false,
  countsAsOptin: false,
  sortOrder: "100",
  active: true,
});

function draftFrom(rule: TagRulePanelRow): Draft {
  return {
    tag: rule.tag,
    matchField: rule.matchField,
    matchOp: rule.matchOp,
    matchValue:
      rule.matchField === "amount_cents"
        ? (Number(rule.matchValue) / 100).toFixed(2)
        : rule.matchValue,
    effect: effectOf(rule),
    excludeFromAov: rule.excludeFromAov,
    countsAsOptin: rule.countsAsOptin,
    sortOrder: String(rule.sortOrder),
    active: rule.active,
  };
}

function toInput(d: Draft): TagRuleInput {
  return {
    tag: d.tag,
    matchField: d.matchField,
    matchOp: d.matchOp,
    matchValue: d.matchValue,
    countsAsRevenue: d.effect === "tag_only",
    countsAsOptin: d.countsAsOptin,
    exclude: d.effect === "exclude",
    excludeFromAov: d.excludeFromAov,
    hideFromDashboard: d.effect === "hide",
    sortOrder: Number.parseInt(d.sortOrder, 10),
    active: d.active,
  };
}

const money = (c: number) => formatUSD(cents(c));

/**
 * Payment tag rules for one offer — what each payment in its feed MEANS.
 *
 * Every rule shows what it matches in the current feed before and after it is
 * saved, so nobody writes a rule blind. The summary line names what the active
 * rules take out of dashboard cash; deleting a rule puts that money back.
 */
export function PaymentTagRulesPanel({
  slug,
  data,
}: {
  slug: string;
  data: TagRulesPanelData;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { summary } = data;

  return (
    <div className="space-y-4">
      <FeedLine data={data} />

      {data.rules.length === 0 && editing !== "new" ? (
        <EmptyState
          icon={Tags}
          title="No tag rules yet"
          explainer="Every payment in the feed counts as revenue today. Add a rule to label a product, or to keep test charges and pass-throughs out of this offer's dashboard cash."
          action={
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="bg-brand text-brand-foreground press inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
            >
              <Plus className="size-3.5" /> Add a rule
            </button>
          }
        />
      ) : (
        <div className="space-y-2">
          {data.rules.map((rule) =>
            editing === rule.id ? (
              <RuleEditor
                key={rule.id}
                slug={slug}
                ruleId={rule.id}
                initial={draftFrom(rule)}
                common={data.common}
                onDone={() => setEditing(null)}
              />
            ) : (
              <RuleRow
                key={rule.id}
                slug={slug}
                rule={rule}
                onEdit={() => setEditing(rule.id)}
              />
            ),
          )}
          {editing === "new" ? (
            <RuleEditor
              slug={slug}
              initial={blankDraft()}
              common={data.common}
              onDone={() => setEditing(null)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="text-muted-foreground hover:text-foreground hover:bg-secondary/50 inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs font-medium"
            >
              <Plus className="size-3.5" /> Add a rule
            </button>
          )}
        </div>
      )}

      {summary.hiddenCount > 0 && (
        <p className="text-muted-foreground text-xs">
          Active rules take{" "}
          <span className="numeric text-foreground font-medium">
            {money(summary.hiddenCashCents)}
          </span>{" "}
          across {summary.hiddenCount} payment{summary.hiddenCount === 1 ? "" : "s"} out
          of this offer&apos;s dashboard cash (whole feed, all time). Turn a rule off or
          delete it and that money comes straight back.
        </p>
      )}
    </div>
  );
}

function FeedLine({ data }: { data: TagRulesPanelData }) {
  if (!data.feedSource) {
    return (
      <p className="text-faint text-xs">
        No payment feed yet. Rules can be written now and start applying the moment a
        processor or the tracking sheet supplies payments.
      </p>
    );
  }
  return (
    <p className="text-faint text-xs">
      Previewing against the{" "}
      {data.feedSource === "stripe" ? "Stripe" : "tracking sheet"} feed ·{" "}
      {data.feedPaymentCount.toLocaleString("en-US")} payments. Match counts are each
      rule on its own.
    </p>
  );
}

function RuleRow({
  slug,
  rule,
  onEdit,
}: {
  slug: string;
  rule: TagRulePanelRow;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const effect = effectOf(rule);

  const toggle = () =>
    startTransition(async () => {
      setError(null);
      const res = await toggleTagRuleAction(slug, rule.id, !rule.active);
      if (!res.ok) setError(res.errors[0]);
    });

  const remove = () =>
    startTransition(async () => {
      setError(null);
      const res = await deleteTagRuleAction(slug, rule.id);
      if (!res.ok) setError(res.errors[0]);
    });

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3 text-sm",
        !rule.active && "opacity-60",
      )}
    >
      <span className="bg-brand-soft/40 text-brand rounded-md border px-2 py-0.5 text-xs font-medium">
        {rule.tag}
      </span>
      <span className="text-muted-foreground min-w-0 flex-1">
        when {rule.condition}
        <span className="text-faint"> · {effectLabel(effect)}</span>
        {rule.excludeFromAov && <span className="text-faint"> · out of AOV</span>}
        {rule.countsAsOptin && <span className="text-faint"> · marks opt-in</span>}
      </span>
      <span className="numeric text-faint text-xs tabular-nums">
        {rule.matches.count === 0
          ? "matches nothing yet"
          : `matches ${rule.matches.count} · ${money(rule.matches.cashCents)}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="hover:bg-secondary/70 rounded-md border px-2 py-1 text-xs"
        >
          {rule.active ? "Turn off" : "Turn on"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={pending}
          aria-label={`Edit rule ${rule.tag}`}
          className="hover:bg-secondary/70 rounded-md border p-1.5"
        >
          <Pencil className="size-3.5" />
        </button>
        {confirmDelete ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="border-destructive/50 text-destructive hover:bg-destructive/10 rounded-md border px-2 py-1 text-xs"
          >
            Delete for good
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            aria-label={`Delete rule ${rule.tag}`}
            className="hover:bg-secondary/70 rounded-md border p-1.5"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {error && <p className="text-warning w-full text-xs">{error}</p>}
    </div>
  );
}

function RuleEditor({
  slug,
  ruleId,
  initial,
  common,
  onDone,
}: {
  slug: string;
  ruleId?: string;
  initial: Draft;
  common: TagRulesPanelData["common"];
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const isAmount = draft.matchField === "amount_cents";
  const ops = isAmount ? AMOUNT_OPS : TEXT_OPS;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const changeField = (field: string) =>
    setDraft((d) => {
      const nextIsAmount = field === "amount_cents";
      const wasAmount = d.matchField === "amount_cents";
      return {
        ...d,
        matchField: field,
        // Switching between text and amount resets the operator to one that fits.
        matchOp:
          nextIsAmount === wasAmount
            ? d.matchOp
            : nextIsAmount
              ? "amount_eq"
              : "contains",
      };
    });

  const suggestions =
    draft.matchField === "label"
      ? common.labels
      : draft.matchField === "provider"
        ? common.providers
        : draft.matchField === "kind"
          ? common.kinds
          : [];

  const save = () =>
    startTransition(async () => {
      setErrors([]);
      const res = await saveTagRuleAction(slug, toInput(draft), ruleId);
      if (!res.ok) setErrors(res.errors);
      else onDone();
    });

  return (
    <div className="bg-secondary/20 space-y-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_140px_minmax(0,1fr)]">
        <label className="text-faint text-[11px]">
          Tag
          <input
            value={draft.tag}
            onChange={(e) => set("tag", e.target.value)}
            placeholder="test-charge"
            className={inputClass}
          />
        </label>
        <label className="text-faint text-[11px]">
          When
          <select
            value={draft.matchField}
            onChange={(e) => changeField(e.target.value)}
            className={inputClass}
          >
            {FIELD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-faint text-[11px]">
          Match
          <select
            value={draft.matchOp}
            onChange={(e) => set("matchOp", e.target.value)}
            className={inputClass}
          >
            {ops.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-faint text-[11px]">
          {isAmount ? "Dollars" : "Value"}
          <input
            value={draft.matchValue}
            onChange={(e) => set("matchValue", e.target.value)}
            placeholder={isAmount ? "1.00" : "test"}
            inputMode={isAmount ? "decimal" : "text"}
            className={inputClass}
          />
        </label>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-faint text-[11px]">In this feed:</span>
          {suggestions.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => set("matchValue", s.value)}
              className="hover:bg-secondary/70 rounded-full border px-2 py-0.5 text-[11px]"
            >
              {s.value} <span className="text-faint">×{s.count}</span>
            </button>
          ))}
        </div>
      )}

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="text-faint mb-1 text-[11px]">
          What it does to the numbers
        </legend>
        {EFFECTS.map((e) => (
          <label
            key={e.value}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm",
              draft.effect === e.value && "border-brand/50 bg-brand-soft/20",
            )}
          >
            <input
              type="radio"
              name={`effect-${ruleId ?? "new"}`}
              checked={draft.effect === e.value}
              onChange={() => set("effect", e.value)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{e.label}</span>
              <span className="text-muted-foreground block text-xs">{e.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={draft.excludeFromAov}
            onChange={(e) => set("excludeFromAov", e.target.checked)}
          />
          Leave out of average deal size
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={draft.countsAsOptin}
            onChange={(e) => set("countsAsOptin", e.target.checked)}
          />
          Marks the payer as an opt-in
        </label>
        <label className="text-faint flex items-center gap-1.5">
          Order
          <input
            value={draft.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)}
            inputMode="numeric"
            className="bg-secondary/60 text-foreground w-16 rounded-md border px-2 py-1 text-xs"
          />
        </label>
      </div>

      {errors.length > 0 && (
        <ul className="text-warning space-y-0.5 text-xs">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-brand text-brand-foreground press rounded-md px-3 py-1.5 text-xs font-medium"
        >
          {pending ? "Saving…" : ruleId ? "Save rule" : "Add rule"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="hover:bg-secondary/70 rounded-md border px-3 py-1.5 text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
