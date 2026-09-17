import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ClientBookList } from "@/components/accounting/client-book-list";
import { PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/ui/status";
import { clientBook } from "@/lib/accounting/book";
import { loadRoster } from "@/lib/roster-server";
import { dayKeyIn } from "@/lib/time/zone";
import { viewerTimeZone } from "@/lib/time/viewer-zone";

export const metadata = { title: "By Client - GV OS" };
export const dynamic = "force-dynamic";

/**
 * The agency book, cut by client.
 *
 * Same sheet, same rows, same arithmetic as the Accounting front page — only
 * grouped. That is the whole design constraint: if these columns did not add
 * back up to the totals one level up, the page would be worse than not having
 * it, because two screens would disagree about the same money.
 */
export default async function ClientBookPage() {
  const tz = await viewerTimeZone();
  const [{ clients, syncedAt, refreshFailed }, roster] = await Promise.all([
    clientBook(dayKeyIn(new Date(), tz)),
    loadRoster(),
  ]);

  const accents = Object.fromEntries(roster.map((c) => [c.slug, c.accent]));
  const syncedLabel = syncedAt
    ? syncedAt.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="By"
        highlight="client."
        status={
          <StatusPill tone={clients.length ? "live" : "muted"}>
            {clients.length} {clients.length === 1 ? "client" : "clients"}
          </StatusPill>
        }
      />

      <ClientBookList clients={clients} accents={accents} />

      <p className={refreshFailed ? "text-warning text-xs" : "text-faint text-xs"}>
        {syncedLabel === null
          ? "The finance sheet has not been read yet."
          : refreshFailed
            ? `Couldn't reach the finance sheet — showing it as of ${syncedLabel}.`
            : `From the finance sheet, ${syncedLabel}.`}
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/accounting"
          className="bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground group inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          The book
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/accounting/clients/gross"
          className="bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground group inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Gross client ledger
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
