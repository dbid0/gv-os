import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { AgencyDealForm } from "@/components/accounting/agency-deal-form";
import { buttonVariants } from "@/components/ui/button";
import { loadRoster } from "@/lib/roster-server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Log a deal - GV OS" };
export const dynamic = "force-dynamic";

export default async function LogDealPage() {
  const clients = (await loadRoster()).map((c) => c.name);
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Log a"
        highlight="deal."
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
