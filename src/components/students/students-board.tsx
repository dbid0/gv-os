"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { cents, formatUSD } from "@/lib/money";
import type { CohortColumn, Student } from "@/lib/students/board";
import { displayName } from "@/lib/text";
import { cn } from "@/lib/utils";

/** "Sep 12", or "Sep 12, 2025" when it isn't this year. */
const shortDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });

function StudentCard({
  slug,
  student,
  showCash,
}: {
  slug: string;
  student: Student;
  showCash: boolean;
}) {
  const label = student.name
    ? displayName(student.name)
    : (student.email ?? "No email");
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-medium">{label}</p>
        <span className="text-faint shrink-0 text-[11px] tabular-nums">
          wk {student.weeksIn}
        </span>
      </div>
      {student.name && student.email && (
        <p className="text-faint truncate text-[11px]">{student.email}</p>
      )}
      <p className="text-muted-foreground mt-2 text-[11px]">
        Started {shortDate(new Date(student.firstPaidAt))}
        {student.payments > 1 && (
          <> · last paid {shortDate(new Date(student.lastPaidAt))}</>
        )}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-faint text-[11px]">
          {student.payments} payment{student.payments === 1 ? "" : "s"}
        </span>
        {showCash && (
          <span
            className={cn(
              "text-[11px] font-medium tabular-nums",
              student.refunded ? "text-destructive" : "text-success",
            )}
          >
            {formatUSD(cents(student.netCents))}
          </span>
        )}
      </div>
      {student.refunded ? (
        <span className="border-destructive/40 text-destructive mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px]">
          Refunded
        </span>
      ) : (
        student.refundedCents > 0 &&
        showCash && (
          <span className="text-warning mt-2 block text-[10px]">
            {formatUSD(cents(student.refundedCents))} refunded
          </span>
        )
      )}
    </>
  );
  const className =
    "bg-card hover:border-brand/40 hover:bg-secondary/40 block rounded-lg border p-3 text-left transition-colors";
  return student.email ? (
    <Link
      href={`/w/${slug}/leads/${encodeURIComponent(student.email)}`}
      className={className}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * The students board: one column per cohort (weeks since first payment), one
 * card per buyer, newest starts first. A search box filters every column at
 * once by name or email. Columns keep a per-column cap so a large cohort
 * stays scannable; the header count is always the true total.
 */
export function StudentsBoardView({
  slug,
  columns,
  showCash,
  maxPerColumn = 40,
}: {
  slug: string;
  columns: CohortColumn[];
  showCash: boolean;
  maxPerColumn?: number;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      columns.map((col) => ({
        ...col,
        students: q
          ? col.students.filter(
              (s) =>
                (s.name ?? "").toLowerCase().includes(q) ||
                (s.email ?? "").toLowerCase().includes(q),
            )
          : col.students,
      })),
    [columns, q],
  );
  const matches = filtered.reduce((n, c) => n + c.students.length, 0);

  return (
    <div className="space-y-3">
      <label className="bg-secondary/40 flex max-w-sm items-center gap-2 rounded-lg border px-3 py-1.5">
        <Search className="text-faint size-3.5" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a student by name or email"
          className="placeholder:text-faint w-full bg-transparent text-sm outline-none"
        />
        {q && <span className="text-faint shrink-0 text-[11px]">{matches} found</span>}
      </label>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-max auto-cols-[15rem] grid-flow-col gap-3">
          {filtered.map(({ cohort, students }) => (
            <section
              key={cohort.key}
              className="bg-secondary/20 flex max-h-[70vh] flex-col rounded-xl border"
            >
              <header className="border-b px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{cohort.label}</p>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {students.length}
                  </span>
                </div>
                <p className="text-faint text-[11px]">{cohort.hint}</p>
              </header>
              <div className="space-y-2 overflow-y-auto p-2">
                {students.length === 0 ? (
                  <p className="text-faint px-1 py-6 text-center text-xs">
                    {q ? "No match here" : "Nobody in this window"}
                  </p>
                ) : (
                  students
                    .slice(0, maxPerColumn)
                    .map((s) => (
                      <StudentCard
                        key={s.key}
                        slug={slug}
                        student={s}
                        showCash={showCash}
                      />
                    ))
                )}
                {students.length > maxPerColumn && (
                  <p className="text-faint px-1 py-2 text-center text-[11px]">
                    +{students.length - maxPerColumn} more — search to find one
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
