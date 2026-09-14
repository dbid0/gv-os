"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck, Lock } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fileEocAction } from "@/lib/calls/eoc-actions";
import { CLOSE_TYPES, EOC_OUTCOMES, type EocFormInput } from "@/lib/calls/eoc-form";
import { cn } from "@/lib/utils";

export type EocRepOption = { id: string; name: string; role: string | null };

const inputClass =
  "bg-secondary/60 text-foreground mt-1 block w-full rounded-md border px-2.5 py-1.5 text-sm disabled:opacity-60";

const blank = (leadEmail: string): EocFormInput => ({
  leadEmail,
  paymentEmail: "",
  outcome: "",
  closeType: "",
  cashCollected: "",
  contractValue: "",
  closerRepId: "",
  setterRepId: "",
  recordingUrl: "",
  notes: "",
});

/**
 * The end-of-call form. Outcome, close type, cash and contract value are the
 * LOCKED counted fields — shown with a lock, always present, never renamed —
 * because stuck calls and confirmation rates count on them. A
 * booked call's email is fixed (it is the join key); a call logged without a
 * booking takes the email typed here.
 */
export function EocFormSheet({
  slug,
  bookingId,
  leadEmail,
  leadName,
  callLabel,
  reps,
  trigger,
}: {
  slug: string;
  bookingId: string | null;
  leadEmail: string | null;
  leadName: string | null;
  /** "Tue, Sep 9, 2:00 PM" — shown in the header for a booked call. */
  callLabel: string | null;
  reps: EocRepOption[];
  trigger: { label: string; variant: "primary" | "quiet" };
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EocFormInput>(() => blank(leadEmail ?? ""));
  const [submissionKey, setSubmissionKey] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const closed = form.outcome === "closed";

  const openForm = () => {
    setForm(blank(leadEmail ?? ""));
    setErrors([]);
    setDone(false);
    // A fresh key per opening: a double-click or a retried request inside this
    // opening files once; reopening the form starts a new report.
    setSubmissionKey(crypto.randomUUID());
    setOpen(true);
  };

  const set = <K extends keyof EocFormInput>(key: K, value: EocFormInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const chooseOutcome = (key: string) =>
    setForm((f) =>
      key === "closed"
        ? { ...f, outcome: key }
        : // Leaving "closed" clears the close fields so they can't ride along.
          { ...f, outcome: key, closeType: "", cashCollected: "", contractValue: "" },
    );

  const submit = () =>
    startTransition(async () => {
      setErrors([]);
      const res = await fileEocAction(slug, form, bookingId, submissionKey);
      if (!res.ok) {
        setErrors(res.errors);
        return;
      }
      setDone(true);
      setOpen(false);
    });

  // Setters and DM setters book; everyone else can close. Anyone but a pure
  // closer can have set the call.
  const closers = reps.filter((r) => r.role !== "setter" && r.role !== "dm_setter");
  const setters = reps.filter((r) => r.role !== "closer");

  return (
    <>
      <button
        type="button"
        onClick={openForm}
        className={cn(
          "press inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
          trigger.variant === "primary"
            ? "bg-brand text-brand-foreground"
            : "hover:bg-secondary/70 border",
        )}
      >
        <ClipboardCheck className="size-3.5" />
        {done ? "Filed" : trigger.label}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="gap-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>End-of-call report</SheetTitle>
            <SheetDescription>
              {leadName ?? leadEmail ?? "A call with no booking"}
              {callLabel ? ` · ${callLabel}` : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <label className="text-faint block text-[11px]">
              Lead email {bookingId && <span className="ml-1">(from the booking)</span>}
              <input
                value={form.leadEmail}
                onChange={(e) => set("leadEmail", e.target.value)}
                disabled={Boolean(bookingId)}
                placeholder="name@example.com"
                className={inputClass}
              />
            </label>

            <fieldset>
              <legend className="text-faint mb-1.5 flex items-center gap-1 text-[11px]">
                <Lock className="size-3" /> What happened
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {EOC_OUTCOMES.map((o) => (
                  <label
                    key={o.key}
                    className={cn(
                      "cursor-pointer rounded-md border p-2.5",
                      form.outcome === o.key && "border-brand/50 bg-brand-soft/20",
                    )}
                  >
                    <input
                      type="radio"
                      name="eoc-outcome"
                      className="sr-only"
                      checked={form.outcome === o.key}
                      onChange={() => chooseOutcome(o.key)}
                    />
                    <span className="block text-sm font-medium">{o.label}</span>
                    <span className="text-muted-foreground block text-[11px]">
                      {o.hint}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {closed && (
              <div className="bg-secondary/20 space-y-3 rounded-lg border p-3">
                <p className="text-faint flex items-center gap-1 text-[11px]">
                  <Lock className="size-3" /> The close
                </p>
                <label className="text-faint block text-[11px]">
                  Close type
                  <select
                    value={form.closeType}
                    onChange={(e) => set("closeType", e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Pick one</option>
                    {CLOSE_TYPES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-faint block text-[11px]">
                    Contract value ($)
                    <input
                      value={form.contractValue}
                      onChange={(e) => set("contractValue", e.target.value)}
                      inputMode="decimal"
                      placeholder="6000"
                      className={inputClass}
                    />
                  </label>
                  <label className="text-faint block text-[11px]">
                    Cash taken on the call ($)
                    <input
                      value={form.cashCollected}
                      onChange={(e) => set("cashCollected", e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      className={inputClass}
                    />
                  </label>
                </div>
                <label className="text-faint block text-[11px]">
                  Paid from a different email? (optional)
                  <input
                    value={form.paymentEmail}
                    onChange={(e) => set("paymentEmail", e.target.value)}
                    placeholder="leave blank if the same"
                    className={inputClass}
                  />
                </label>
                <p className="text-faint text-[11px]">
                  This is your record of the call. The processor stays the record of
                  what was paid; nothing here changes the books.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="text-faint block text-[11px]">
                Closer
                <select
                  value={form.closerRepId}
                  onChange={(e) => set("closerRepId", e.target.value)}
                  className={inputClass}
                >
                  <option value="">Not recorded</option>
                  {closers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-faint block text-[11px]">
                Setter
                <select
                  value={form.setterRepId}
                  onChange={(e) => set("setterRepId", e.target.value)}
                  className={inputClass}
                >
                  <option value="">Not recorded</option>
                  {setters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="text-faint block text-[11px]">
              Recording link (optional)
              <input
                value={form.recordingUrl}
                onChange={(e) => set("recordingUrl", e.target.value)}
                placeholder="https://"
                className={inputClass}
              />
            </label>
            <label className="text-faint block text-[11px]">
              Notes (optional)
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={4}
                placeholder="Objections, what they need, next step"
                className={inputClass}
              />
            </label>

            {errors.length > 0 && (
              <ul className="text-warning space-y-1 text-xs" role="alert">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2 border-t p-4">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="bg-brand text-brand-foreground press rounded-md px-3 py-1.5 text-sm font-medium"
            >
              {pending ? "Filing…" : "File report"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="hover:bg-secondary/70 rounded-md border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
