"use client";

import { motion, useReducedMotion } from "motion/react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { fadeUp, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useEntranceOnce } from "@/lib/client-state";

/**
 * The table.
 *
 * Every module in GV OS is ultimately a table: deals, clients, reps, ledger
 * rows. Building it once properly is the difference between six consistent
 * modules and six that drift apart.
 *
 * Decisions baked in so no screen re-makes them:
 * - Numeric columns are right-aligned and use tabular numerals, so figures form
 *   a readable column and a changing value does not shift the row.
 * - The header is sticky. A table you have to scroll back up to read is a list.
 * - Rows arrive staggered on mount, and the stagger is capped so a hundred rows
 *   do not take four seconds to appear.
 * - Sorting is indicated on every sortable column, not only the active one, so
 *   you can tell what is sortable without clicking to find out.
 */

export type Column<T> = {
  key: string;
  header: string;
  /** Right-aligns and applies tabular numerals. Use for money and counts. */
  numeric?: boolean;
  /** Omit to make the column unsortable. */
  sortBy?: (row: T) => string | number;
  render: (row: T) => ReactNode;
  className?: string;
};

type SortState = { key: string; direction: "asc" | "desc" } | null;

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  empty,
  caption,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Shown instead of an empty body. Always provide one. */
  empty?: ReactNode;
  caption?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const entrance = useEntranceOnce();
  const [sort, setSort] = useState<SortState>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortBy) return rows;

    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortBy!(a);
      const bv = column.sortBy!(b);
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * factor;
    });
  }, [rows, sort, columns]);

  const toggle = (key: string) => {
    setSort((current) =>
      current?.key === key
        ? current.direction === "asc"
          ? { key, direction: "desc" }
          : null // third click clears, rather than trapping you in a sort
        : { key, direction: "asc" },
    );
  };

  if (rows.length === 0 && empty) {
    return <div className="px-5 py-12 text-center">{empty}</div>;
  }

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}

        <thead className="bg-card sticky top-0 z-10">
          <tr className="border-b">
            {columns.map((column) => {
              const sortable = Boolean(column.sortBy);
              const active = sort?.key === column.key;

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    active
                      ? sort!.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : sortable
                        ? "none"
                        : undefined
                  }
                  className={cn(
                    "text-muted-foreground px-5 py-3 text-[11px] font-medium tracking-wider uppercase",
                    column.numeric ? "text-right" : "text-left",
                    column.className,
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggle(column.key)}
                      className={cn(
                        "hover:text-foreground inline-flex items-center gap-1.5 transition-colors",
                        active && "text-foreground",
                        column.numeric && "flex-row-reverse",
                      )}
                    >
                      {column.header}
                      {!active && <ChevronsUpDown className="size-3 opacity-40" />}
                      {active && sort!.direction === "asc" && (
                        <ChevronUp className="text-brand size-3" />
                      )}
                      {active && sort!.direction === "desc" && (
                        <ChevronDown className="text-brand size-3" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <motion.tbody
          initial={reduceMotion || !entrance ? false : "hidden"}
          animate="visible"
          // Capped so a long table does not crawl in.
          variants={stagger(Math.min(0.03, 0.6 / Math.max(sorted.length, 1)))}
        >
          {sorted.map((row) => (
            <motion.tr
              key={getRowKey(row)}
              variants={fadeUp}
              className="hover:bg-secondary/50 border-b transition-colors last:border-0"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-5 py-3.5",
                    column.numeric && "numeric text-right",
                    column.className,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}

/** The standard empty state for a table with no rows yet. */
export function TableEmpty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-sm space-y-2">
      <p className="text-sm font-medium">{title}</p>
      {detail && <p className="text-muted-foreground text-sm">{detail}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
