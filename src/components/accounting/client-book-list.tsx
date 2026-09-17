import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { AgencyBook } from "@/components/accounting/agency-book";
import { Money } from "@/components/ui/metric";
import type { ClientBookEntry } from "@/lib/accounting/client-book";
import type { SummaryRow } from "@/lib/accounting/agency-summary";
import { cents } from "@/lib/money";

/**
 * The book, one line per client, each line opening onto that client's own
 * copy of the agency book table.
 *
 * A stack of nine full tables would be the same information and unreadable,
 * so the list carries only the figure anyone scans for — cash, across the
 * three periods — and the rest is one click away. Expanding is plain
 * `<details>`: it works before the page hydrates and it prints.
 *
 * The month columns are LABELLED with their months for the same reason the
 * book table labels them: on the 1st, "this month" is ambiguous exactly when
 * the number matters most.
 */

const MONTH_LABEL = (key: string) =>
  new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });

const pick = (entry: ClientBookEntry, key: string): SummaryRow =>
  entry.summary.sections.flatMap((s) => s.rows).find((r) => r.key === key)!;

function Figure({ value }: { value: number | null }) {
  return (
    <span className="tabular-nums">
      {value === null ? (
        <span className="text-faint">—</span>
      ) : (
        <Money amount={cents(value)} />
      )}
    </span>
  );
}

export function ClientBookList({
  clients,
  accents,
}: {
  clients: ClientBookEntry[];
  /** slug → brand colour, so a client's line is themed like their workspace. */
  accents: Record<string, string>;
}) {
  if (clients.length === 0) {
    return (
      <p className="bg-card text-faint rounded-xl border px-4 py-10 text-center text-sm">
        No deals on the sheet yet.
      </p>
    );
  }

  const thisMonth = clients[0].summary.thisMonthKey;
  const lastMonth = clients[0].summary.lastMonthKey;

  return (
    <section className="bg-card overflow-hidden rounded-xl border">
      <div className="text-faint grid grid-cols-[1fr_auto] gap-x-6 border-b px-4 py-2.5 text-[11px] tracking-wider uppercase sm:grid-cols-[1fr_repeat(3,minmax(5.5rem,auto))]">
        <span>Client</span>
        <span className="hidden text-right sm:block">{MONTH_LABEL(thisMonth)}</span>
        <span className="hidden text-right sm:block">{MONTH_LABEL(lastMonth)}</span>
        <span className="text-right">All time</span>
      </div>

      {clients.map((entry) => {
        const cash = pick(entry, "cash");
        return (
          <details
            key={entry.slug ?? `name-${entry.name}`}
            className="group border-b last:border-0"
          >
            <summary className="hover:bg-secondary/40 grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-6 px-4 py-3 text-sm transition-colors sm:grid-cols-[1fr_repeat(3,minmax(5.5rem,auto))]">
              <span className="flex min-w-0 items-center gap-2">
                <ChevronRight className="text-faint size-3.5 shrink-0 transition-transform group-open:rotate-90" />
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    background:
                      (entry.slug && accents[entry.slug]) || "var(--border-strong)",
                  }}
                />
                <span className="truncate font-medium">{entry.name}</span>
                <span className="text-faint shrink-0 text-xs">{entry.dealCount}</span>
              </span>
              <span className="hidden text-right sm:block">
                <Figure value={cash.thisMonth} />
              </span>
              <span className="hidden text-right sm:block">
                <Figure value={cash.lastMonth} />
              </span>
              <span className="text-right font-medium">
                <Figure value={cash.allTime} />
              </span>
            </summary>

            <div className="space-y-3 px-4 pt-1 pb-4">
              <AgencyBook summary={entry.summary} />
              {entry.slug && (
                <Link
                  href={`/clients/${entry.slug}`}
                  className="text-muted-foreground hover:text-brand inline-flex items-center gap-1 text-xs font-medium transition-colors"
                >
                  {entry.name} workspace
                  <ChevronRight className="size-3" />
                </Link>
              )}
            </div>
          </details>
        );
      })}
    </section>
  );
}
