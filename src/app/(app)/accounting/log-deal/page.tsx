import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { AgencyDealForm } from "@/components/accounting/agency-deal-form";
import { buttonVariants } from "@/components/ui/button";
import { roster } from "@/lib/roster";
import { cn } from "@/lib/utils";

export const metadata = { title: "Log a deal - GV OS" };
export const dynamic = "force-dynamic";

export default function LogDealPage() {
  const clients = roster.map((c) => c.name);
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Log a"
        highlight="deal."
        description="Agency deal entry — writes straight into the finance sheet and syncs back into GV OS. The sheet stays the source of truth."
        actions={
          <Link
            href="/accounting"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-3.5" /> Accounting
          </Link>
        }
      />
      <AgencyDealForm clients={clients} />
    </div>
  );
}
