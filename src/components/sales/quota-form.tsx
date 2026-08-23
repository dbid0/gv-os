"use client";

import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { createQuota } from "@/lib/sales/actions";
import { QUOTA_METRICS, isMoneyMetric } from "@/lib/sales/quota-pacing";

interface RepOption {
  id: string;
  name: string;
  role: string;
  clientId: string;
}
interface TeamOption {
  id: string;
  name: string;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

const selectClass =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** The current month as YYYY-MM, the sensible default period for a new quota. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function QuotaForm({ teams, reps }: { teams: TeamOption[]; reps: RepOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    scope: "rep" as "rep" | "team",
    clientId: teams[0]?.id ?? "",
    repId: "",
    metric: "cash_collected",
    target: "",
    period: currentMonth(),
    notes: "",
  });

  const teamReps = useMemo(
    () => reps.filter((r) => r.clientId === f.clientId),
    [reps, f.clientId],
  );
  const money = isMoneyMetric(f.metric);

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.clientId) return setErr("Pick a team first.");
    if (f.scope === "rep" && !f.repId) return setErr("Pick a rep for a rep quota.");
    if (f.target.trim() === "") return setErr("A quota needs a target.");

    start(async () => {
      try {
        await createQuota({
          scope: f.scope,
          clientId: f.clientId,
          repId: f.scope === "rep" ? f.repId : undefined,
          metric: f.metric,
          target: f.target,
          period: f.period,
          notes: f.notes || undefined,
        });
        router.push("/sales/quotas");
        router.refresh();
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not create the quota.");
      }
    });
  }

  return (
    <Panel title="Create a quota">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assign to">
            <select
              className={selectClass}
              value={f.scope}
              onChange={(e) =>
                setF({ ...f, scope: e.target.value as typeof f.scope, repId: "" })
              }
            >
              <option value="rep">A rep</option>
              <option value="team">A whole team</option>
            </select>
          </Field>

          <Field label="Team">
            <select
              className={selectClass}
              value={f.clientId}
              onChange={(e) => setF({ ...f, clientId: e.target.value, repId: "" })}
            >
              {teams.length === 0 && <option value="">— add a team first —</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>

          {f.scope === "rep" && (
            <Field label="Rep">
              <select
                className={selectClass}
                value={f.repId}
                onChange={(e) => setF({ ...f, repId: e.target.value })}
              >
                <option value="">— pick a rep —</option>
                {teamReps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.role.replace("_", " ")})
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Metric">
            <select
              className={selectClass}
              value={f.metric}
              onChange={(e) => setF({ ...f, metric: e.target.value })}
            >
              {QUOTA_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={money ? "Target ($)" : "Target (count)"}>
            <Input
              value={f.target}
              onChange={(e) => setF({ ...f, target: e.target.value })}
              inputMode={money ? "decimal" : "numeric"}
              placeholder={money ? "50000" : "40"}
              required
            />
          </Field>

          <Field label="Period (month)">
            <Input
              type="month"
              value={f.period}
              onChange={(e) => setF({ ...f, period: e.target.value })}
              required
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Notes (optional)">
              <Input
                value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })}
                placeholder="Stretch goal for the launch month"
              />
            </Field>
          </div>
        </div>

        <p className="text-faint text-xs">
          The actual-so-far is measured from real data — collected cash, closed deals,
          or EOD activity — and paced against a straight line for the month. A quota
          never moves money; it only sets the line.
        </p>

        {err && <p className="text-destructive text-xs">{err}</p>}

        <Button type="submit" disabled={pending || !f.clientId} className="gap-2">
          <Target className="size-3.5" /> Create quota
        </Button>
      </form>
    </Panel>
  );
}
