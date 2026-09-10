"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";

import {
  claimPaymentAction,
  unclaimPaymentAction,
} from "@/app/(app)/accounting/payments/claim-actions";
import { CLAIM_ROLES, type ClaimRole } from "@/lib/payments/claims";

const ROLE_LABEL: Record<ClaimRole, string> = {
  setter: "Setter",
  closer: "Closer",
  dm_setter: "DM setter",
};

/**
 * The per-payment claim cell: existing seat claims as removable chips, plus
 * a seat+rep picker for the next one. Claims credit reps — they never touch
 * the money — so this cell can afford to be forgiving; the store re-checks
 * every rule server-side and its refusal reason renders here verbatim.
 */
export function ClaimCell({
  paymentEventId,
  claims,
  reps,
}: {
  paymentEventId: string;
  claims: { role: string; repName: string }[];
  reps: { id: string; name: string }[];
}) {
  const [role, setRole] = useState<ClaimRole>("closer");
  const [repId, setRepId] = useState(reps[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (reps.length === 0) {
    return <span className="text-faint text-xs">no reps for this offer</span>;
  }

  const openSeats = CLAIM_ROLES.filter((r) => !claims.some((c) => c.role === r));
  // The chosen seat may have just been claimed — fall to the first open one
  // so the select and the submitted value can never disagree.
  const activeRole = openSeats.includes(role) ? role : (openSeats[0] ?? "closer");

  const claim = () =>
    startTransition(async () => {
      setError(null);
      const res = await claimPaymentAction({ paymentEventId, role: activeRole, repId });
      if (!res.ok) setError(res.reason ?? "Could not claim.");
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {claims.map((c) => (
        <span
          key={c.role}
          className="bg-secondary/60 text-foreground inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
        >
          <span className="text-faint">
            {ROLE_LABEL[c.role as ClaimRole] ?? c.role}
          </span>
          {c.repName}
          <button
            type="button"
            aria-label={`Remove the ${c.role} claim`}
            onClick={() =>
              startTransition(() =>
                unclaimPaymentAction({
                  paymentEventId,
                  role: c.role as ClaimRole,
                }),
              )
            }
            className="text-faint hover:text-warning"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {openSeats.length > 0 && (
        <span className="inline-flex items-center gap-1">
          <select
            value={activeRole}
            onChange={(e) => setRole(e.target.value as ClaimRole)}
            className="bg-secondary/60 text-foreground rounded border px-1 py-0.5 text-[11px]"
            aria-label="Seat"
          >
            {openSeats.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <select
            value={repId}
            onChange={(e) => setRepId(e.target.value)}
            className="bg-secondary/60 text-foreground max-w-28 rounded border px-1 py-0.5 text-[11px]"
            aria-label="Rep"
          >
            {reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={claim}
            disabled={pending || !repId}
            className="bg-secondary hover:bg-secondary/70 text-foreground rounded border px-1.5 py-0.5 text-[11px] font-medium"
          >
            Claim
          </button>
        </span>
      )}
      {error && <span className="text-warning text-[11px]">{error}</span>}
    </div>
  );
}
