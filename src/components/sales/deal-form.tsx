"use client";

import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { Plus, X } from "lucide-react";

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

type Role = "closer" | "setter" | "dm_setter" | "manager";
interface SplitRow {
  repId: string;
  role: Role;
  ratePct: string;
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
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [f, setF] = useState({
    clientId: teams[0]?.id ?? "",
    customer: "",
    closingRepId: "",
    source: "outbound",
    recurrence: "one_time" as "one_time" | "recurring",
    contractValue: "",
    cashCollected: "",
  });
  const [splits, setSplits] = useState<SplitRow[]>([
    { repId: "", role: "closer", ratePct: "" },
  ]);

  const teamReps = useMemo(
    () => reps.filter((r) => r.clientId === f.clientId),
    [reps, f.clientId],
  );

  const rateFor = (repId: string, role: Role) => {
    const rep = teamReps.find((r) => r.id === repId);
    const team = teams.find((t) => t.id === f.clientId);
    const bps =
      rep?.commissionBps ??
      (role === "closer" ? (team?.defaultCloserBps ?? null) : null);
    return bps === null ? "" : String(bps / 100);
  };

  const setSplit = (i: number, patch: Partial<SplitRow>) =>
    setSplits((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addSplit = () =>
    setSplits((rows) => [...rows, { repId: "", role: "setter", ratePct: "" }]);
  const removeSplit = (i: number) =>
    setSplits((rows) => rows.filter((_, idx) => idx !== i));

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.clientId) return setErr("Pick a team first.");
    if (f.contractValue.trim() === "" || f.cashCollected.trim() === "")
      return setErr("Contract value and cash collected are required.");

    const clean = splits
      .filter((s) => s.repId && s.ratePct.trim() !== "")
      .map((s) => ({ repId: s.repId, role: s.role, ratePct: Number(s.ratePct) }));

    start(async () => {
      try {
        const res = await logDeal(
          {
            clientId: f.clientId,
            customerName: f.customer || undefined,
            closingRepId: f.closingRepId || undefined,
            source: f.source || undefined,
            recurrence: f.recurrence,
            contractValue: f.contractValue,
            cashCollected: f.cashCollected,
            splits: clean,
          },
          allowDuplicate,
        );

        // An identical deal was already logged on this offer today. Refuse and
        // explain — the ledger is append-only, so a double-logged sale has to
        // be reversed rather than deleted — but let a real second sale through
        // on a deliberate second action.
        if (!res.ok && res.duplicate) {
          setDuplicate(res.message);
          setErr(null);
          return;
        }

        router.push("/sales/commissions");
        router.refresh();
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not log the deal.");
      }
    });
  }

  return (
    <Panel title="Log a deal">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team">
            <select
              className={selectClass}
              value={f.clientId}
              onChange={(e) => {
                setF({ ...f, clientId: e.target.value, closingRepId: "" });
                setSplits([{ repId: "", role: "closer", ratePct: "" }]);
              }}
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
              onChange={(e) => {
                const repId = e.target.value;
                setF({ ...f, closingRepId: repId });
                // default the first (closer) split to the closing rep
                setSplits((rows) =>
                  rows.map((r, i) =>
                    i === 0
                      ? { ...r, repId, ratePct: r.ratePct || rateFor(repId, "closer") }
                      : r,
                  ),
                );
              }}
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
          <div className="hidden sm:block" />
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

        {/* Commission splits — one row per participant */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Commission splits
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSplit}
              className="gap-1.5"
            >
              <Plus className="size-3.5" /> Add split
            </Button>
          </div>

          {splits.map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto_5rem_auto] items-end gap-2"
            >
              <Field label={i === 0 ? "Rep" : ""}>
                <select
                  className={selectClass}
                  value={s.repId}
                  onChange={(e) => setSplit(i, { repId: e.target.value })}
                >
                  <option value="">— rep —</option>
                  {teamReps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={i === 0 ? "Role" : ""}>
                <select
                  className={selectClass}
                  value={s.role}
                  onChange={(e) => setSplit(i, { role: e.target.value as Role })}
                >
                  <option value="closer">Closer</option>
                  <option value="setter">Setter</option>
                  <option value="dm_setter">DM Setter</option>
                  <option value="manager">Manager</option>
                </select>
              </Field>
              <Field label={i === 0 ? "Rate %" : ""}>
                <Input
                  value={s.ratePct}
                  onChange={(e) => setSplit(i, { ratePct: e.target.value })}
                  inputMode="decimal"
                  placeholder="10"
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeSplit(i)}
                disabled={splits.length === 1}
                aria-label="Remove split"
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <p className="text-faint text-xs">
            Add setter, DM-setter, or manager rows for their cut of THIS deal; a
            rep&apos;s default rate fills in when you pick them. A manager&apos;s
            team-wide skim is set on their rep profile, not here.
          </p>
        </div>

        {err && <p className="text-destructive text-xs">{err}</p>}

        {duplicate && (
          <label className="text-warning flex max-w-xl items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={allowDuplicate}
              onChange={(e) => setAllowDuplicate(e.target.checked)}
              className="mt-0.5"
            />
            <span>{duplicate} Tick to log it anyway.</span>
          </label>
        )}

        <Button
          type="submit"
          disabled={pending || !f.clientId || (duplicate !== null && !allowDuplicate)}
          className="gap-2"
        >
          <Plus className="size-3.5" /> Log deal
        </Button>
      </form>
    </Panel>
  );
}
