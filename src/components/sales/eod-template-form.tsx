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
import { createEodTemplate } from "@/lib/sales/actions";
import {
  BASE_EOD_FIELDS,
  CADENCE_LABEL,
  EOD_CADENCES,
  EOD_ROLES,
  ROLE_LABEL,
  baseFieldLabel,
} from "@/lib/sales/eod-fields";

interface TeamOption {
  id: string;
  name: string;
}
interface CustomRow {
  label: string;
  type: "number" | "currency" | "text";
}
interface CalcRow {
  label: string;
  numerator: string;
  denominator: string;
  format: "number" | "percent" | "currency";
}

const selectClass =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

export function EodTemplateForm({ teams }: { teams: TeamOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [clientId, setClientId] = useState(teams[0]?.id ?? "");
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof EOD_ROLES)[number]>("closer");
  const [cadence, setCadence] = useState<(typeof EOD_CADENCES)[number]>("eod");
  const [base, setBase] = useState<Set<string>>(
    () => new Set(["dials", "shows", "calls_taken"]),
  );
  const [customs, setCustoms] = useState<CustomRow[]>([]);
  const [calcs, setCalcs] = useState<CalcRow[]>([]);

  // The field keys a calculated metric can reference: the base fields turned on
  // plus every custom field. A rate is built from these, RepVision-style.
  const availableKeys = useMemo(() => {
    const keys = [...base].map((k) => ({ key: k, label: baseFieldLabel(k) }));
    for (const c of customs) {
      const key = slugify(c.label);
      if (key) keys.push({ key, label: c.label || key });
    }
    return keys;
  }, [base, customs]);

  const toggleBase = (key: string) =>
    setBase((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!clientId) return setErr("Pick a team.");
    if (name.trim() === "") return setErr("Give the template a name.");

    const customFields = customs
      .filter((c) => c.label.trim() !== "")
      .map((c) => ({ key: slugify(c.label), label: c.label.trim(), type: c.type }));
    const calcFields = calcs
      .filter((c) => c.label.trim() && c.numerator && c.denominator)
      .map((c) => ({
        key: slugify(c.label),
        label: c.label.trim(),
        format: c.format,
        numerator: c.numerator,
        denominator: c.denominator,
      }));

    start(async () => {
      try {
        await createEodTemplate({
          clientId,
          name,
          role,
          cadence,
          baseFields: [...base],
          customFields,
          calcFields,
        });
        setName("");
        setCustoms([]);
        setCalcs([]);
        setOpen(false);
        router.refresh();
      } catch (error) {
        setErr(
          error instanceof Error ? error.message : "Could not create the template.",
        );
      }
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" className="gap-2">
        <Plus className="size-3.5" /> New template
      </Button>
    );
  }

  return (
    <Panel title="New EOD template">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team">
            <select
              className={selectClass}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              {teams.length === 0 && <option value="">— add a team first —</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Template name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Closer EOD"
            />
          </Field>
          <Field label="Role">
            <select
              className={selectClass}
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              {EOD_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cadence">
            <select
              className={selectClass}
              value={cadence}
              onChange={(e) => setCadence(e.target.value as typeof cadence)}
            >
              {EOD_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {CADENCE_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Base fields — the standard activity counts to turn on. */}
        <div className="space-y-2 border-t pt-4">
          <span className="text-muted-foreground text-xs font-medium">Base fields</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BASE_EOD_FIELDS.map((f) => (
              <label
                key={f.key}
                className="hover:bg-secondary/60 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
              >
                <input
                  type="checkbox"
                  checked={base.has(f.key)}
                  onChange={() => toggleBase(f.key)}
                  className="accent-brand size-4"
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        {/* Custom fields — team-specific extra questions. */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Custom fields
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setCustoms((r) => [...r, { label: "", type: "number" }])}
            >
              <Plus className="size-3.5" /> Add field
            </Button>
          </div>
          {customs.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
              <Field label={i === 0 ? "Question" : ""}>
                <Input
                  value={c.label}
                  onChange={(e) =>
                    setCustoms((r) =>
                      r.map((x, idx) =>
                        idx === i ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="# of Offers Made"
                />
              </Field>
              <Field label={i === 0 ? "Type" : ""}>
                <select
                  className={selectClass}
                  value={c.type}
                  onChange={(e) =>
                    setCustoms((r) =>
                      r.map((x, idx) =>
                        idx === i
                          ? { ...x, type: e.target.value as CustomRow["type"] }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="number">Number</option>
                  <option value="currency">Currency</option>
                  <option value="text">Text</option>
                </select>
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove custom field"
                onClick={() => setCustoms((r) => r.filter((_, idx) => idx !== i))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Calculated metrics — numerator ÷ denominator over the fields above. */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">
              Calculated metrics (rate = a ÷ b)
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={availableKeys.length < 1}
              onClick={() =>
                setCalcs((r) => [
                  ...r,
                  {
                    label: "",
                    numerator: availableKeys[0]?.key ?? "",
                    denominator: availableKeys[0]?.key ?? "",
                    format: "percent",
                  },
                ])
              }
            >
              <Plus className="size-3.5" /> Add metric
            </Button>
          </div>
          {calcs.map((c, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_1fr_7rem_auto] items-end gap-2"
            >
              <Field label={i === 0 ? "Name" : ""}>
                <Input
                  value={c.label}
                  onChange={(e) =>
                    setCalcs((r) =>
                      r.map((x, idx) =>
                        idx === i ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Show Rate"
                />
              </Field>
              <Field label={i === 0 ? "Numerator" : ""}>
                <select
                  className={selectClass}
                  value={c.numerator}
                  onChange={(e) =>
                    setCalcs((r) =>
                      r.map((x, idx) =>
                        idx === i ? { ...x, numerator: e.target.value } : x,
                      ),
                    )
                  }
                >
                  {availableKeys.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={i === 0 ? "Denominator" : ""}>
                <select
                  className={selectClass}
                  value={c.denominator}
                  onChange={(e) =>
                    setCalcs((r) =>
                      r.map((x, idx) =>
                        idx === i ? { ...x, denominator: e.target.value } : x,
                      ),
                    )
                  }
                >
                  {availableKeys.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={i === 0 ? "Format" : ""}>
                <select
                  className={selectClass}
                  value={c.format}
                  onChange={(e) =>
                    setCalcs((r) =>
                      r.map((x, idx) =>
                        idx === i
                          ? { ...x, format: e.target.value as CalcRow["format"] }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="percent">Percent</option>
                  <option value="number">Number</option>
                  <option value="currency">Currency</option>
                </select>
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove calculated metric"
                onClick={() => setCalcs((r) => r.filter((_, idx) => idx !== i))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        {err && <p className="text-destructive text-xs">{err}</p>}

        <div className="flex items-center gap-2 border-t pt-4">
          <Button type="submit" disabled={pending || !clientId} className="gap-2">
            <Plus className="size-3.5" /> Create template
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
