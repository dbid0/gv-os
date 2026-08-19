import Link from "next/link";
import type { ReactNode } from "react";
import { ClipboardList, Plus } from "lucide-react";

import { SalesTabs } from "@/components/sales/sales-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
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
export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Sales"
        highlight="command center"
        description="Every closed deal, what each rep is owed, and how the team is pacing — one honest view of the revenue engine, reconciled to the ledger."
        status={<StatusPill tone="live">Live</StatusPill>}
        actions={
          <>
            <Button variant="outline" size="sm" disabled className="gap-2">
              <ClipboardList className="size-3.5" /> Submit EOD
            </Button>
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

      {children}
    </div>
  );
}
