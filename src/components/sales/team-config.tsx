"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Check, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { createRep, setRepActive, updateTeamDefaults } from "@/lib/sales/actions";
import { ROLE_LABEL } from "@/lib/sales/eod-fields";
import type { TeamConfig as TeamConfigData } from "@/lib/sales/queries";
import { cn } from "@/lib/utils";

const bpsToPct = (bps: number | null) => (bps == null ? "" : String(bps / 100));

const selectClass =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type RepRole = "closer" | "setter" | "dm_setter" | "manager";

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
  const { toast } = useToast();
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
            try {
              await setRepActive(rep.id, !active);
              router.refresh();
            } catch (e) {
              toast({
                tone: "error",
                title: e instanceof Error ? e.message : "Action failed.",
              });
            }
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

  const { toast } = useToast();
  const [repName, setRepName] = useState("");
  const [repRole, setRepRole] = useState<RepRole>("closer");
  const [addingRep, startAddRep] = useTransition();

  function addRep(e: FormEvent) {
    e.preventDefault();
    const name = repName.trim();
    if (!name) return;
    startAddRep(async () => {
      try {
        await createRep({ clientId: team.id, name, role: repRole });
        setRepName("");
        toast({ tone: "success", title: `Added ${name}` });
        router.refresh();
      } catch (error) {
        toast({
          tone: "error",
          title: error instanceof Error ? error.message : "Could not add the rep.",
        });
      }
    });
  }

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
          <p className="text-muted-foreground px-5 pt-5 text-sm">
            No reps on this team yet — add the first below.
          </p>
        ) : (
          <div className="bg-border flex flex-col gap-px">
            {team.reps.map((rep) => (
              <RepRow key={rep.id} rep={rep} />
            ))}
          </div>
        )}
        {/* Add a rep straight onto this team — writes to the reps table the
            leaderboard, EODs, and commissions all read. */}
        <form onSubmit={addRep} className="flex flex-wrap items-end gap-2 border-t p-4">
          <label className="min-w-[9rem] flex-1 space-y-1.5">
            <span className="text-muted-foreground text-xs font-medium">Add a rep</span>
            <Input
              value={repName}
              onChange={(e) => setRepName(e.target.value)}
              placeholder="Rep name"
            />
          </label>
          <select
            className={cn(selectClass, "w-32")}
            value={repRole}
            onChange={(e) => setRepRole(e.target.value as RepRole)}
            aria-label="Role"
          >
            <option value="closer">Closer</option>
            <option value="setter">Setter</option>
            <option value="dm_setter">DM Setter</option>
            <option value="manager">Manager</option>
          </select>
          <Button
            type="submit"
            disabled={addingRep || !repName.trim()}
            className="gap-2"
          >
            <UserPlus className="size-3.5" /> Add
          </Button>
        </form>
      </Panel>
    </div>
  );
}
