import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/ui/status";
import { clientInitial, roster } from "@/lib/roster";

export const metadata = {
  title: "Clients - GV OS",
};

export default function ClientsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="The"
        highlight="roster."
        description="Every active done-for-you engagement. Open a client to reach their command center — sales, content, and the numbers, in one place."
        status={<StatusPill tone="live">{roster.length} active</StatusPill>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roster.map((client) => (
          <Link
            key={client.slug}
            href={`/clients/${client.slug}`}
            className="group card-grad hover-lift hover:border-brand/40 relative overflow-hidden rounded-xl border p-5"
          >
            {/* The client's own colour, as a hairline at the top edge only. */}
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-0.5"
              style={{ background: client.accent }}
            />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold tracking-tight">
                  {client.name}
                </h3>
                <p className="text-muted-foreground text-xs">
                  {client.owner} · {client.category}
                </p>
              </div>
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-lg border text-sm font-bold"
                style={{
                  color: client.accent,
                  borderColor: `${client.accent}55`,
                  background: `${client.accent}14`,
                }}
              >
                {clientInitial(client.name)}
              </span>
            </div>

            <p className="text-muted-foreground mt-3 line-clamp-2 text-sm leading-relaxed">
              {client.blurb}
            </p>

            <div className="text-faint mt-4 flex items-center justify-between border-t pt-3 text-xs">
              <span>Since {client.since}</span>
              <span className="text-muted-foreground group-hover:text-foreground inline-flex items-center gap-1 transition-colors">
                Open
                <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
