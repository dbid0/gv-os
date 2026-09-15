"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw, Trash2 } from "lucide-react";

import {
  logStudentCallAction,
  setStudentCallVoidedAction,
} from "@/app/w/[slug]/students/student-call-actions";
import { displayName } from "@/lib/text";
import { useViewerTimeZone } from "@/components/shell/time-zone";

const fieldClass =
  "bg-secondary/60 text-foreground mt-0.5 block w-full rounded-md border px-2 py-1.5 text-sm";

const dayKey = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

export type StudentCallListRow = {
  id: string;
  studentEmail: string;
  heldAt: string;
  coach: string | null;
  notes: string | null;
};

/**
 * Log a 1-on-1 coaching call against a student, and see (and void) the most
 * recent ones. The student is picked by email from this offer's students; a
 * call counts against the offer's limit on the board the moment it's logged.
 */
export function StudentCallsPanel({
  slug,
  students,
  recent,
  voided,
}: {
  slug: string;
  students: { email: string; name: string | null }[];
  recent: StudentCallListRow[];
  voided: StudentCallListRow[];
}) {
  const router = useRouter();
  const [student, setStudent] = useState("");
  const viewerZone = useViewerTimeZone();
  const [heldOn, setHeldOn] = useState(() => dayKey(new Date(), viewerZone));
  const [coach, setCoach] = useState("");
  const [notes, setNotes] = useState("");
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<string[]>([]);
  const [logged, setLogged] = useState(false);
  const [pending, startTransition] = useTransition();
  const names = new Map(students.map((s) => [s.email, s.name]));
  const who = (email: string) => {
    const name = names.get(email);
    return name ? `${displayName(name)} · ${email}` : email;
  };

  const log = () =>
    startTransition(async () => {
      setErrors([]);
      setLogged(false);
      const res = await logStudentCallAction(
        slug,
        { studentEmail: student, heldOn, coach, notes },
        submissionKey,
      );
      if (!res.ok) {
        setErrors(res.errors);
        return;
      }
      setStudent("");
      setNotes("");
      setSubmissionKey(crypto.randomUUID());
      setLogged(true);
      router.refresh();
    });

  const toggle = (id: string, voidIt: boolean) =>
    startTransition(async () => {
      setErrors([]);
      const res = await setStudentCallVoidedAction(slug, id, voidIt);
      if (!res.ok) setErrors(res.errors);
      else router.refresh();
    });

  const row = (c: StudentCallListRow, isVoided: boolean) => (
    <li key={c.id} className="flex items-start justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm">
          {who(c.studentEmail)}
          <span className="text-faint ml-2 text-xs">
            {new Date(c.heldAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              // A logged call is a calendar DAY, stored at noon Central on it
              // (heldAtFor); read back on that same zone so it never shifts.
              timeZone: "America/Chicago",
            })}
            {c.coach && ` · with ${c.coach}`}
          </span>
        </p>
        {c.notes && (
          <p className="text-muted-foreground line-clamp-2 text-xs">{c.notes}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => toggle(c.id, !isVoided)}
        disabled={pending}
        aria-label={isVoided ? "Restore this call" : "Void this call"}
        className="text-faint hover:text-foreground shrink-0 rounded-md border p-1.5"
      >
        {isVoided ? (
          <RotateCcw className="size-3.5" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-faint text-[11px] sm:col-span-2">
          Student
          <input
            value={student}
            onChange={(e) => setStudent(e.target.value)}
            list="student-call-options"
            placeholder="student's email"
            className={fieldClass}
          />
          <datalist id="student-call-options">
            {students.map((s) => (
              <option key={s.email} value={s.email}>
                {s.name ? displayName(s.name) : s.email}
              </option>
            ))}
          </datalist>
        </label>
        <label className="text-faint text-[11px]">
          Day of the call
          <input
            type="date"
            value={heldOn}
            onChange={(e) => setHeldOn(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="text-faint text-[11px]">
          Coach
          <input
            value={coach}
            onChange={(e) => setCoach(e.target.value)}
            placeholder="who ran it"
            maxLength={80}
            className={fieldClass}
          />
        </label>
        <label className="text-faint text-[11px] sm:col-span-2 lg:col-span-4">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="what you covered, what they're doing next"
            className={fieldClass}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={log}
          disabled={pending}
          className="bg-brand text-brand-foreground press rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Logging…" : "Log 1-on-1 call"}
        </button>
        {logged && <span className="text-success text-xs">Logged</span>}
      </div>
      {errors.length > 0 && (
        <ul className="text-warning space-y-0.5 text-xs" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <div>
          <p className="text-faint mb-1.5 text-[11px] font-medium tracking-wider uppercase">
            Recent calls
          </p>
          <ul className="divide-y rounded-lg border">
            {recent.map((c) => row(c, false))}
          </ul>
        </div>
      )}
      {voided.length > 0 && (
        <details>
          <summary className="text-faint cursor-pointer text-xs">
            Voided calls ({voided.length})
          </summary>
          <ul className="mt-1.5 divide-y rounded-lg border opacity-70">
            {voided.map((c) => row(c, true))}
          </ul>
        </details>
      )}
    </div>
  );
}
