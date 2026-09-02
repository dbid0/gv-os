import Link from "next/link";
import type { ReactNode } from "react";
import { ClipboardList, Plus } from "lucide-react";

import { SalesTabs } from "@/components/sales/sales-tabs";
import { getViewerScope } from "@/lib/home/viewer-scope";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status";
import { cn } from "@/lib/utils";

/**
 * The Sales section shell.
 *
 * The header and the tab bar live here, mounted once, so navigating between the
 * four views swaps only the content and the active tab glides rather than the
 * whole page re-entering. Every view underneath is a version of RepVision, held
 * to the same rule as the rest of the app: no figure appears until the data
 * behind it is real.
 */
export default async function SalesLayout({ children }: { children: ReactNode }) {
  const scope = await getViewerScope();
  const laneless = scope.restricted && scope.allowed?.length === 0;
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Sales"
        highlight="command center"
        status={
          scope.restricted ? (
            // Say plainly whose book this is. A rep seeing smaller numbers
            // without being told why would read it as the agency shrinking.
            <StatusPill tone="live">{scope.label ?? "Your offer"}</StatusPill>
          ) : (
            <StatusPill tone="live">Live</StatusPill>
          )
        }
        actions={
          <>
            <Link
              href="/sales/eod/submit"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-2",
              )}
            >
              <ClipboardList className="size-3.5" /> Submit EOD
            </Link>
            <Link
              href="/sales/deals/new"
              className={cn(buttonVariants({ size: "sm" }), "gap-2")}
            >
              <Plus className="size-3.5" /> Log a deal
            </Link>
          </>
        }
      />

      <SalesTabs />

      {/* A scoped viewer with no offer on their roster row is a DATA GAP, not
          a zero. Saying so beats rendering $0 tables that read as real. */}
      {laneless && (
        <div className="rounded-lg border border-dashed p-4 text-sm">
          <p className="font-medium">Your account isn&apos;t linked to an offer yet</p>
          <p className="text-muted-foreground mt-1">
            Sales figures are scoped to the offer you work on. Ask your manager to set
            yours on the Team roster and this fills in.
          </p>
        </div>
      )}

      {children}
    </div>
  );
}
