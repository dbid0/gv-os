"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { setRepActive, updateTeamDefaults } from "@/lib/sales/actions";
import { ROLE_LABEL } from "@/lib/sales/eod-fields";
import type { TeamConfig as TeamConfigData } from "@/lib/sales/queries";

const bpsToPct = (bps: number | null) => (bps == null ? "" : String(bps / 100));

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

function num(s: string): number | null {
  return s.trim() === "" ? null : Number(s);
}

function RepRow({ rep }: { rep: TeamConfigData["reps"][number] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = rep.status === "active";
  return (
    <div className="bg-card flex items-center gap-4 px-5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{rep.name}</span>
        <span className="text-muted-foreground block text-xs">
          {ROLE_LABEL[rep.role] ?? rep.role}
          {rep.commissionBps != null && ` · ${rep.commissionBps / 100}%`}
        </span>
      </span>
      {active ? (
        <StatusPill tone="live">Active</StatusPill>
      ) : (
        <StatusPill tone="muted">Inactive</StatusPill>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await setRepActive(rep.id, !active);
            router.refresh();
          })
        }
      >
        {pending ? "…" : active ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}

export function TeamConfig({ team }: { team: TeamConfigData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [closer, setCloser] = useState(bpsToPct(team.defaultCloserBps));
  const [setter, setSetter] = useState(bpsToPct(team.defaultSetterBps));
  const [dm, setDm] = useState(bpsToPct(team.defaultDmSetterBps));
  const [manager, setManager] = useState(bpsToPct(team.defaultManagerBps));
  const [deduct, setDeduct] = useState(team.deductProcessorFees);
  const [feePct, setFeePct] = useState(bpsToPct(team.processorFeeBps));
  const [feeFlat, setFeeFlat] = useState(
    team.processorFeeFlatCents ? String(team.processorFeeFlatCents / 100) : "",
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      try {
        await updateTeamDefaults({
          clientId: team.id,
          defaultCloserPct: num(closer),
          defaultSetterPct: num(setter),
          defaultDmSetterPct: num(dm),
          defaultManagerPct: num(manager),
          deductProcessorFees: deduct,
          processorFeePct: num(feePct),
          processorFeeFlat: feeFlat,
        });
        setSaved(true);
        router.refresh();
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not save.");
      }
    });
  }

  const dirty = () => setSaved(false);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Commission defaults">
        <form onSubmit={submit} className="space-y-5">
          <p className="text-muted-foreground text-xs">
            Applied to a deal with no explicit split. Changing these re-rolls the
            Commissions payout run.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Closer %">
              <Input
                value={closer}
                onChange={(e) => {
                  setCloser(e.target.value);
                  dirty();
                }}
                inputMode="decimal"
                placeholder="10"
              />
            </Field>
            <Field label="Setter %">
              <Input
                value={setter}
                onChange={(e) => {
                  setSetter(e.target.value);
                  dirty();
                }}
                inputMode="decimal"
                placeholder="—"
              />
            </Field>
            <Field label="DM setter %">
              <Input
                value={dm}
                onChange={(e) => {
                  setDm(e.target.value);
                  dirty();
                }}
                inputMode="decimal"
                placeholder="—"
              />
            </Field>
            <Field label="Manager skim %">
              <Input
                value={manager}
                onChange={(e) => {
                  setManager(e.target.value);
                  dirty();
                }}
                inputMode="decimal"
                placeholder="3"
              />
            </Field>
          </div>

          <div className="space-y-3 border-t pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={deduct}
                onChange={(e) => {
                  setDeduct(e.target.checked);
                  dirty();
                }}
                className="accent-brand size-4"
              />
              Deduct processor fees before commission
            </label>
            {deduct && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Processor fee %">
                  <Input
                    value={feePct}
                    onChange={(e) => {
                      setFeePct(e.target.value);
                      dirty();
                    }}
                    inputMode="decimal"
                    placeholder="2.9"
                  />
                </Field>
                <Field label="Flat fee per txn ($)">
                  <Input
                    value={feeFlat}
                    onChange={(e) => {
                      setFeeFlat(e.target.value);
                      dirty();
                    }}
                    inputMode="decimal"
                    placeholder="0.30"
                  />
                </Field>
              </div>
            )}
          </div>

          {err && <p className="text-destructive text-xs">{err}</p>}

          <div className="border-t pt-4">
            <Button type="submit" disabled={pending} className="gap-2">
              {saved && !pending ? (
                <>
                  <Check className="size-3.5" /> Saved
                </>
              ) : pending ? (
                "Saving…"
              ) : (
                "Save defaults"
              )}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel
        title="Reps"
        aside={<span className="text-faint text-xs">{team.reps.length}</span>}
        padded={false}
      >
        {team.reps.length === 0 ? (
          <p className="text-muted-foreground p-5 text-sm">No reps on this team yet.</p>
        ) : (
          <div className="bg-border flex flex-col gap-px">
            {team.reps.map((rep) => (
              <RepRow key={rep.id} rep={rep} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
