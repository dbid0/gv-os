"use client";

import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { PhoneCall } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Segmented, type Segment } from "@/components/ui/segmented";
import {
  ACTIVITY_MODES,
  CALL_TYPES,
  DISPOSITIONS,
  type ActivityMode,
} from "@/lib/sales/call-activity";
import { logActivity } from "@/lib/sales/call-actions";

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

export function LogActivityForm({
  teams,
  reps,
}: {
  teams: TeamOption[];
  reps: RepOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    mode: "call" as ActivityMode,
    clientId: teams[0]?.id ?? "",
    repId: "",
    callType: "discovery",
    disposition: "sale_closed",
    recordingUrl: "",
    leadUrl: "",
    customerName: "",
    customerEmail: "",
    notes: "",
  });

  const teamReps = useMemo(
    () => reps.filter((r) => r.clientId === f.clientId),
    [reps, f.clientId],
  );

  const booking = f.mode === "booking";

  function setMode(mode: string) {
    const m = mode as ActivityMode;
    // A booking is an appointment that has not resolved, so its natural
    // disposition is the set itself; a call defaults to the win.
    setF((prev) => ({
      ...prev,
      mode: m,
      disposition: m === "booking" ? "follow_up_booked" : "sale_closed",
    }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.clientId) return setErr("Pick a team first.");

    start(async () => {
      try {
        await logActivity({
          mode: f.mode,
          clientId: f.clientId,
          repId: f.repId || undefined,
          callType: f.callType || undefined,
          disposition: f.disposition,
          recordingUrl: f.recordingUrl || undefined,
          leadUrl: f.leadUrl || undefined,
          customerName: f.customerName || undefined,
          customerEmail: f.customerEmail || undefined,
          notes: f.notes || undefined,
        });
        router.push("/sales/call-log");
        router.refresh();
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not log the activity.");
      }
    });
  }

  return (
    <Panel title="Log activity">
      <form onSubmit={submit} className="space-y-5">
        <Segmented
          ariaLabel="Activity type"
          value={f.mode}
          onChange={setMode}
          segments={
            ACTIVITY_MODES.map((m) => ({
              value: m.key,
              label: m.label,
            })) satisfies Segment[]
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
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

          <Field label="Assign to rep">
            <select
              className={selectClass}
              value={f.repId}
              onChange={(e) => setF({ ...f, repId: e.target.value })}
            >
              <option value="">— unassigned —</option>
              {teamReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.role.replace("_", " ")})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Call type">
            <select
              className={selectClass}
              value={f.callType}
              onChange={(e) => setF({ ...f, callType: e.target.value })}
            >
              {CALL_TYPES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Disposition">
            <select
              className={selectClass}
              value={f.disposition}
              onChange={(e) => setF({ ...f, disposition: e.target.value })}
            >
              {DISPOSITIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Recording link">
            <Input
              value={f.recordingUrl}
              onChange={(e) => setF({ ...f, recordingUrl: e.target.value })}
              placeholder="https://fathom.video/…"
              inputMode="url"
            />
          </Field>

          <Field label="Lead URL / CRM link">
            <Input
              value={f.leadUrl}
              onChange={(e) => setF({ ...f, leadUrl: e.target.value })}
              placeholder="https://app.close.com/lead/…"
              inputMode="url"
            />
          </Field>

          <Field label="Customer name">
            <Input
              value={f.customerName}
              onChange={(e) => setF({ ...f, customerName: e.target.value })}
              placeholder="Jordan Rivera"
            />
          </Field>

          <Field label="Customer email">
            <Input
              type="email"
              value={f.customerEmail}
              onChange={(e) => setF({ ...f, customerEmail: e.target.value })}
              placeholder="jordan@example.com"
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Notes (optional)">
              <Input
                value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })}
                placeholder={
                  booking
                    ? "Setter note — context for the closer"
                    : "What happened on the call"
                }
              />
            </Field>
          </div>
        </div>

        <p className="text-faint text-xs">
          A logged activity is self-reported — it records what happened on a call or the
          booking a setter set. It never writes a ledger event, so logging can never
          move the money numbers; it only feeds rep activity metrics.
        </p>

        {err && <p className="text-destructive text-xs">{err}</p>}

        <Button type="submit" disabled={pending || !f.clientId} className="gap-2">
          <PhoneCall className="size-3.5" /> {booking ? "Log booking" : "Log call"}
        </Button>
      </form>
    </Panel>
  );
}
