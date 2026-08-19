"use client";

import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { logDeal } from "@/lib/sales/actions";

interface RepOption {
  id: string;
  name: string;
  role: string;
  clientId: string;
  commissionBps: number | null;
}
interface TeamOption {
  id: string;
  name: string;
  defaultCloserBps: number | null;
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

export function DealForm({ teams, reps }: { teams: TeamOption[]; reps: RepOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    clientId: teams[0]?.id ?? "",
    customer: "",
    closingRepId: "",
    source: "outbound",
    recurrence: "one_time" as "one_time" | "recurring",
    contractValue: "",
    cashCollected: "",
    ratePct: "",
  });

  const teamReps = useMemo(
    () => reps.filter((r) => r.clientId === f.clientId),
    [reps, f.clientId],
  );

  // Suggest the split rate from the closing rep's rate, else the team default.
  const suggestedRate = useMemo(() => {
    const rep = teamReps.find((r) => r.id === f.closingRepId);
    const team = teams.find((t) => t.id === f.clientId);
    const bps = rep?.commissionBps ?? team?.defaultCloserBps ?? null;
    return bps === null ? "" : String(bps / 100);
  }, [teamReps, teams, f.closingRepId, f.clientId]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.clientId) {
      setErr("Pick a team first.");
      return;
    }
    if (f.contractValue.trim() === "" || f.cashCollected.trim() === "") {
      setErr("Contract value and cash collected are required.");
      return;
    }
    const rate = f.ratePct.trim() !== "" ? f.ratePct : suggestedRate;
    start(async () => {
      try {
        await logDeal({
          clientId: f.clientId,
          customerName: f.customer || undefined,
          closingRepId: f.closingRepId || undefined,
          source: f.source || undefined,
          recurrence: f.recurrence,
          contractValue: f.contractValue,
          cashCollected: f.cashCollected,
          splits:
            f.closingRepId && rate !== ""
              ? [{ repId: f.closingRepId, role: "closer", ratePct: Number(rate) }]
              : [],
        });
        router.push("/sales/commissions");
        router.refresh();
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not log the deal.");
      }
    });
  }

  return (
    <Panel title="Log a deal">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team">
            <select
              className={selectClass}
              value={f.clientId}
              onChange={(e) =>
                setF({ ...f, clientId: e.target.value, closingRepId: "" })
              }
            >
              {teams.length === 0 && <option value="">— add a team first —</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Customer">
            <Input
              value={f.customer}
              onChange={(e) => setF({ ...f, customer: e.target.value })}
              placeholder="Acme Co"
            />
          </Field>
          <Field label="Closing rep">
            <select
              className={selectClass}
              value={f.closingRepId}
              onChange={(e) => setF({ ...f, closingRepId: e.target.value })}
            >
              <option value="">— unassigned —</option>
              {teamReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.role.replace("_", " ")})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source">
            <select
              className={selectClass}
              value={f.source}
              onChange={(e) => setF({ ...f, source: e.target.value })}
            >
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
              <option value="referral">Referral</option>
              <option value="paid_ads">Paid ads</option>
            </select>
          </Field>
          <Field label="Type">
            <select
              className={selectClass}
              value={f.recurrence}
              onChange={(e) =>
                setF({ ...f, recurrence: e.target.value as typeof f.recurrence })
              }
            >
              <option value="one_time">One-time</option>
              <option value="recurring">Recurring</option>
            </select>
          </Field>
          <Field label="Closer rate %">
            <Input
              value={f.ratePct}
              onChange={(e) => setF({ ...f, ratePct: e.target.value })}
              inputMode="decimal"
              placeholder={suggestedRate || "10"}
            />
          </Field>
          <Field label="Contract value ($)">
            <Input
              value={f.contractValue}
              onChange={(e) => setF({ ...f, contractValue: e.target.value })}
              inputMode="decimal"
              placeholder="10000"
              required
            />
          </Field>
          <Field label="Cash collected ($)">
            <Input
              value={f.cashCollected}
              onChange={(e) => setF({ ...f, cashCollected: e.target.value })}
              inputMode="decimal"
              placeholder="8000"
              required
            />
          </Field>
        </div>

        {err && <p className="text-destructive text-xs">{err}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending || !f.clientId} className="gap-2">
            <Plus className="size-3.5" /> Log deal
          </Button>
          <span className="text-faint text-xs">
            Records the deal, a ledger payment for the cash, and the closer&apos;s split
            — commissions recompute instantly.
          </span>
        </div>
      </form>
    </Panel>
  );
}
