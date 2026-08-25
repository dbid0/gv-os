"use client";

import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { CalendarDays, Check, CircleDollarSign } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { submitEod } from "@/lib/sales/actions";
import { ROLE_LABEL, baseFieldLabel } from "@/lib/sales/eod-fields";
import type { EodRepRow, EodTemplateRow } from "@/lib/sales/queries";
import { cn } from "@/lib/utils";

const selectClass =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

export function EodSubmitForm({
  reps,
  templates,
}: {
  reps: EodRepRow[];
  templates: EodTemplateRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [repId, setRepId] = useState(reps[0]?.id ?? "");
  const [date, setDate] = useState(todayIso());
  const [dayOff, setDayOff] = useState(false);
  const [mood, setMood] = useState<number | null>(null);
  const [nums, setNums] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [cash, setCash] = useState("");
  const [revenue, setRevenue] = useState("");
  const [notes, setNotes] = useState("");

  const rep = reps.find((r) => r.id === repId);
  const template = useMemo(
    () =>
      rep
        ? templates.find(
            (t) =>
              t.clientId === rep.clientId && t.role === rep.role && t.cadence === "eod",
          )
        : undefined,
    [rep, templates],
  );

  const setNum = (k: string, v: string) => setNums((p) => ({ ...p, [k]: v }));
  const setText = (k: string, v: string) => setTexts((p) => ({ ...p, [k]: v }));

  function resetForRep(id: string) {
    setRepId(id);
    setMood(null);
    setNums({});
    setTexts({});
    setCash("");
    setRevenue("");
    setNotes("");
    setDone(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!rep) return setErr("Pick a rep.");

    const metrics: Record<string, number> = {};
    if (!dayOff) {
      // The wellbeing check-in is captured on every EOD, template or not — it's
      // what drives the "check on this rep" alert when it comes in below 3.
      if (mood != null) metrics.mood = mood;
      if (template) {
        for (const key of template.baseFields) metrics[key] = Number(nums[key] || 0);
        for (const f of template.customFields) {
          if (f.type !== "text") metrics[f.key] = Number(nums[f.key] || 0);
        }
      }
    }
    // Text answers fold into notes so the numeric bundle stays clean.
    const textLines = template
      ? template.customFields
          .filter((f) => f.type === "text" && texts[f.key]?.trim())
          .map((f) => `${f.label}: ${texts[f.key].trim()}`)
      : [];
    const fullNotes = [notes.trim(), ...textLines].filter(Boolean).join("\n");

    start(async () => {
      try {
        await submitEod({
          repId: rep.id,
          reportDate: date,
          cadence: "eod",
          dayOff,
          metrics,
          notes: fullNotes || undefined,
          cashCollected: rep.role === "closer" ? cash || undefined : undefined,
          revenue: rep.role === "closer" ? revenue || undefined : undefined,
        });
        setDone(true);
        router.refresh();
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not submit the EOD.");
      }
    });
  }

  const numericCustoms = template?.customFields.filter((f) => f.type !== "text") ?? [];
  const textCustoms = template?.customFields.filter((f) => f.type === "text") ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Panel
        title="Submit EOD"
        aside={
          rep ? (
            <StatusPill tone="live">
              {rep.name} · {ROLE_LABEL[rep.role] ?? rep.role}
            </StatusPill>
          ) : undefined
        }
      >
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rep">
              <select
                className={selectClass}
                value={repId}
                onChange={(e) => resetForRep(e.target.value)}
              >
                {reps.length === 0 && <option value="">— no reps yet —</option>}
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.teamName} ({ROLE_LABEL[r.role] ?? r.role})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <div className="relative">
                <CalendarDays className="text-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </Field>
          </div>

          <label className="hover:bg-secondary/60 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors">
            <input
              type="checkbox"
              checked={dayOff}
              onChange={(e) => setDayOff(e.target.checked)}
              className="accent-brand size-4"
            />
            Mark this a day off (no activity to report)
          </label>

          {!dayOff && (
            <div className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs font-medium">
                  How are you feeling today?
                </span>
                <span className="text-faint text-[11px]">1 = rough · 5 = great</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={mood === n}
                    onClick={() => setMood(mood === n ? null : n)}
                    className={cn(
                      "press h-9 rounded-md border text-sm font-medium transition-colors",
                      mood === n
                        ? n < 3
                          ? "border-warning/50 bg-warning/10 text-warning"
                          : "border-brand/50 bg-brand-soft/60 text-brand"
                        : "text-muted-foreground hover:bg-secondary/60",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {mood != null && mood < 3 && (
                <p className="text-warning text-[11px]">
                  Below 3 flags the sales manager to check in with this rep.
                </p>
              )}
            </div>
          )}

          {!dayOff && rep && !template && (
            <p className="text-faint rounded-md border border-dashed px-3 py-3 text-sm">
              No EOD template for a {ROLE_LABEL[rep.role] ?? rep.role} on {rep.teamName}{" "}
              yet. Create one on the Templates tab, or submit a day off / notes only.
            </p>
          )}

          {!dayOff && template && (
            <>
              {/* Base activity fields */}
              <div className="space-y-3 border-t pt-4">
                <span className="text-muted-foreground text-xs font-medium">
                  Activity
                </span>
                <div className="grid gap-3 sm:grid-cols-3">
                  {template.baseFields.map((key) => (
                    <Field key={key} label={baseFieldLabel(key)}>
                      <Input
                        value={nums[key] ?? ""}
                        onChange={(e) => setNum(key, e.target.value)}
                        inputMode="numeric"
                        placeholder="0"
                      />
                    </Field>
                  ))}
                  {numericCustoms.map((f) => (
                    <Field key={f.key} label={f.label}>
                      <Input
                        value={nums[f.key] ?? ""}
                        onChange={(e) => setNum(f.key, e.target.value)}
                        inputMode={f.type === "currency" ? "decimal" : "numeric"}
                        placeholder={f.type === "currency" ? "$0" : "0"}
                      />
                    </Field>
                  ))}
                </div>
              </div>

              {/* Closer cash → auto-creates a deal on submit */}
              {rep?.role === "closer" && (
                <div className="surface-brand space-y-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <CircleDollarSign className="text-brand size-4" />
                    <span className="text-sm font-medium">Deals closed today</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Cash collected ($)">
                      <Input
                        value={cash}
                        onChange={(e) => setCash(e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                      />
                    </Field>
                    <Field label="Contract revenue ($)">
                      <Input
                        value={revenue}
                        onChange={(e) => setRevenue(e.target.value)}
                        inputMode="decimal"
                        placeholder="defaults to cash"
                      />
                    </Field>
                  </div>
                  <p className="text-faint text-xs">
                    Logging cash here creates the deal and its ledger payment
                    automatically — no separate entry needed.
                  </p>
                </div>
              )}

              {/* Text questions */}
              {textCustoms.map((f) => (
                <Field key={f.key} label={f.label}>
                  <textarea
                    value={texts[f.key] ?? ""}
                    onChange={(e) => setText(f.key, e.target.value)}
                    rows={2}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  />
                </Field>
              ))}
            </>
          )}

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything else worth flagging"
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            />
          </Field>

          {err && <p className="text-destructive text-xs">{err}</p>}
          {done && (
            <p className="text-brand flex items-center gap-1.5 text-xs">
              <Check className="size-3.5" /> EOD submitted for {rep?.name}.
            </p>
          )}

          <div className="flex items-center gap-2 border-t pt-4">
            <Button type="submit" disabled={pending || !rep} className="gap-2">
              <Check className="size-3.5" /> Submit EOD
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
