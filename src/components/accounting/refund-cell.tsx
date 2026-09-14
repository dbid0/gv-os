"use client";

import { useState, useTransition } from "react";
import { Link2, Unlink } from "lucide-react";

import {
  linkRefundAction,
  unlinkRefundAction,
  unwaiveClawbackAction,
  waiveClawbackAction,
} from "@/app/(app)/accounting/payments/clawback-actions";
import { cents, formatUSD } from "@/lib/money";
import { cn } from "@/lib/utils";

export type RefundCharge = {
  id: string;
  label: string | null;
  email: string | null;
  amountCents: number;
  occurredAt: string | null;
};

export type RefundClawback = {
  role: string;
  repName: string;
  clawbackCents: number | null;
  waived: boolean;
  waiverReason: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  setter: "Setter",
  closer: "Closer",
  dm_setter: "DM setter",
};

const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "undated";

function chargeLabel(c: RefundCharge) {
  return `${formatUSD(cents(Math.abs(c.amountCents)))} · ${shortDate(c.occurredAt)} · ${c.email ?? c.label ?? "no payer"}`;
}

function ClawbackChip({
  refundEventId,
  row,
}: {
  refundEventId: string;
  row: RefundClawback;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const waive = () =>
    startTransition(async () => {
      setError(null);
      const res = await waiveClawbackAction({ refundEventId, role: row.role, reason });
      if (!res.ok) setError(res.reason ?? "Could not waive.");
      else setAsking(false);
    });
  const unwaive = () =>
    startTransition(async () => {
      setError(null);
      const res = await unwaiveClawbackAction({ refundEventId, role: row.role });
      if (!res.ok) setError(res.reason ?? "Could not undo.");
    });

  const amount =
    row.clawbackCents === null ? "rate not set" : formatUSD(cents(row.clawbackCents));

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span
        className={cn(
          "rounded-md border px-1.5 py-0.5",
          row.waived
            ? "text-faint line-through"
            : "text-destructive border-destructive/40",
        )}
        title={row.waiverReason ?? undefined}
      >
        {ROLE_LABEL[row.role] ?? row.role} · {row.repName} · {amount}
      </span>
      {row.waived ? (
        <>
          <span className="text-faint">waived: {row.waiverReason}</span>
          <button
            type="button"
            onClick={unwaive}
            disabled={pending}
            className="text-brand hover:underline"
          >
            undo
          </button>
        </>
      ) : row.clawbackCents !== null && !asking ? (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          waive
        </button>
      ) : null}
      {asking && (
        <span className="flex items-center gap-1">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="why waive it?"
            className="bg-secondary/60 w-36 rounded border px-1.5 py-0.5"
          />
          <button
            type="button"
            onClick={waive}
            disabled={pending}
            className="rounded border px-1.5 py-0.5"
          >
            {pending ? "…" : "Waive"}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="text-faint hover:underline"
          >
            cancel
          </button>
        </span>
      )}
      {error && <span className="text-warning">{error}</span>}
    </div>
  );
}

/**
 * The refund row's credit cell. Unlinked: pick the charge this refund reverses
 * from ranked suggestions (same payer first). Linked: the charge, and each
 * claimed seat's clawback with waive / undo. Every rule is re-checked on the
 * server; its refusal reason renders here verbatim.
 */
export function RefundCell({
  refundEventId,
  linked,
  suggestions,
  clawbacks,
}: {
  refundEventId: string;
  linked: RefundCharge | null;
  suggestions: RefundCharge[];
  clawbacks: RefundClawback[];
}) {
  const [chargeId, setChargeId] = useState(suggestions[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const link = () =>
    startTransition(async () => {
      setError(null);
      const res = await linkRefundAction({ refundEventId, chargeEventId: chargeId });
      if (!res.ok) setError(res.reason ?? "Could not link.");
    });
  const unlink = () =>
    startTransition(async () => {
      setError(null);
      const res = await unlinkRefundAction(refundEventId);
      if (!res.ok) setError(res.reason ?? "Could not unlink.");
    });

  if (linked) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[11px]">
          <Link2 className="text-faint size-3" />
          <span className="text-muted-foreground">Refund of {chargeLabel(linked)}</span>
          <button
            type="button"
            onClick={unlink}
            disabled={pending}
            aria-label="Unlink this refund"
            className="text-faint hover:text-foreground"
          >
            <Unlink className="size-3" />
          </button>
        </div>
        {clawbacks.length === 0 ? (
          <p className="text-faint text-[11px]">
            No seats claimed on that charge — nothing to claw back.
          </p>
        ) : (
          clawbacks.map((c) => (
            <ClawbackChip key={c.role} refundEventId={refundEventId} row={c} />
          ))
        )}
        {error && <p className="text-warning text-[11px]">{error}</p>}
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <span className="text-faint text-[11px]">
        No charge on this offer could be the one refunded
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-faint text-[11px]">Not linked — no clawback derived</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={chargeId}
          onChange={(e) => setChargeId(e.target.value)}
          aria-label="Charge this refund reverses"
          className="bg-secondary/60 max-w-[16rem] rounded-md border px-1.5 py-1 text-[11px]"
        >
          {suggestions.map((s) => (
            <option key={s.id} value={s.id}>
              {chargeLabel(s)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={link}
          disabled={pending || !chargeId}
          className="hover:bg-secondary/70 rounded-md border px-2 py-1 text-[11px] font-medium"
        >
          {pending ? "Linking…" : "Link refund"}
        </button>
      </div>
      {error && <p className="text-warning text-[11px]">{error}</p>}
    </div>
  );
}
