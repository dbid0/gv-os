"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { AlertTriangle, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Kpi, Money } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status";
import { DataTable, type Column } from "@/components/ui/table";
import { type Cents } from "@/lib/money";
import { fadeUp } from "@/lib/motion";
import { markAllPaid, markRepPaid } from "@/lib/sales/actions";
import { cn } from "@/lib/utils";
import { useEntranceOnce } from "@/lib/client-state";

/** One rep's owed line, flattened and serialisable for the client. */
export interface CommissionLine {
  repId: string;
  name: string;
  role: string;
  teamName: string;
  rateBps: number | null;
  deals: number;
  baseCents: Cents;
  commissionCents: Cents;
  bonusCents: Cents;
  skimCents: Cents;
  totalOwedCents: Cents;
  paid: boolean;
}

export interface CommissionSummary {
  cashCollectedCents: Cents;
  revenueCents: Cents;
  commissionCents: Cents;
  skimCents: Cents;
  totalOwedCents: Cents;
  dealsMissingSplits: number;
  dealsUncommissioned: number;
}

const dash = <span className="text-faint">—</span>;
const pct = (bps: number | null) =>
  bps === null ? dash : `${(bps / 100).toFixed(1)}%`;

function PayCell({ line }: { line: CommissionLine }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { toast } = useToast();

  if (line.paid) return <StatusPill tone="live">Paid</StatusPill>;
  if (line.totalOwedCents <= 0) return dash;

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await markRepPaid(line.repId);
            router.refresh();
          } catch (e) {
            toast({
              tone: "error",
              title: e instanceof Error ? e.message : "Action failed.",
            });
          }
        })
      }
    >
      {pending ? "Marking…" : "Mark paid"}
    </Button>
  );
}

function MarkAllButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { toast } = useToast();
  return (
    <Button
      size="sm"
      disabled={pending}
      className="gap-1.5"
      onClick={() =>
        start(async () => {
          try {
            await markAllPaid();
            router.refresh();
          } catch (e) {
            toast({
              tone: "error",
              title: e instanceof Error ? e.message : "Action failed.",
            });
          }
        })
      }
    >
      <Check className="size-3.5" />
      {pending ? "Marking…" : "Mark all paid"}
    </Button>
  );
}

export function CommissionsTable({
  lines,
  summary,
  basis,
}: {
  lines: CommissionLine[];
  summary: CommissionSummary;
  basis: "cash_collected" | "deal_revenue";
}) {
  const reduceMotion = useReducedMotion();
  const entrance = useEntranceOnce();
  const paidCount = lines.filter((l) => l.paid).length;

  const basisTab = (key: "cash_collected" | "deal_revenue", label: string) => (
    <Link
      href={`/sales/commissions?basis=${key}`}
      className={cn(
        "rounded-md px-2.5 py-1 transition-colors",
        basis === key
          ? "bg-card text-foreground border-border-strong border font-medium"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  const columns: Column<CommissionLine>[] = [
    {
      key: "name",
      header: "Participant",
      sortBy: (r) => r.name,
      render: (r) => (
        <span>
          <span className="block text-sm">{r.name}</span>
          <span className="text-muted-foreground block text-xs capitalize">
            {r.role.replace("_", " ")}
          </span>
        </span>
      ),
    },
    { key: "team", header: "Team", render: (r) => r.teamName },
    { key: "rate", header: "%", numeric: true, render: (r) => pct(r.rateBps) },
    {
      key: "deals",
      header: "Deals",
      numeric: true,
      sortBy: (r) => r.deals,
      render: (r) => r.deals || dash,
    },
    {
      key: "base",
      header: "Base",
      numeric: true,
      render: (r) => (r.baseCents ? <Money amount={r.baseCents} /> : dash),
    },
    {
      key: "commission",
      header: "Commission",
      numeric: true,
      sortBy: (r) => r.commissionCents,
      render: (r) => (r.commissionCents ? <Money amount={r.commissionCents} /> : dash),
    },
    {
      key: "bonus",
      header: "Bonus",
      numeric: true,
      render: (r) => (r.bonusCents ? <Money amount={r.bonusCents} /> : dash),
    },
    {
      key: "total",
      header: "Total owed",
      numeric: true,
      sortBy: (r) => r.totalOwedCents,
      render: (r) => <Money amount={r.totalOwedCents} className="font-medium" />,
    },
    {
      key: "status",
      header: "Payout",
      numeric: true,
      render: (r) => (
        <div className="flex justify-end">
          <PayCell line={r} />
        </div>
      ),
    },
  ];

  return (
    <motion.div
      initial={reduceMotion || !entrance ? false : "hidden"}
      animate="visible"
      variants={fadeUp}
      className="space-y-6"
    >
      <Panel title="Commissions" aside={<StatusPill tone="live">Live</StatusPill>}>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label={basis === "deal_revenue" ? "Deal revenue" : "Cash collected"}
            value={
              <Money
                amount={
                  basis === "deal_revenue"
                    ? summary.revenueCents
                    : summary.cashCollectedCents
                }
              />
            }
          />
          <Kpi
            label="Rep commissions"
            value={<Money amount={summary.commissionCents} />}
          />
          <Kpi label="Top-line skim" value={<Money amount={summary.skimCents} />} />
          <Kpi
            label="Total owed"
            value={<Money amount={summary.totalOwedCents} />}
            tone="brand"
          />
        </div>

        {(summary.dealsUncommissioned > 0 ||
          summary.dealsMissingSplits - summary.dealsUncommissioned > 0) && (
          <div className="mt-5 space-y-1.5 border-t pt-4 text-xs">
            {summary.dealsUncommissioned > 0 && (
              <div className="text-warning flex items-center gap-2">
                <AlertTriangle className="size-3.5 shrink-0" />
                {summary.dealsUncommissioned} closed deal
                {summary.dealsUncommissioned === 1 ? "" : "s"} with no commission rate —{" "}
                <span className="font-medium">$0 to any rep</span>. Set the team&apos;s
                default rate or add a split so these pay.
              </div>
            )}
            {summary.dealsMissingSplits - summary.dealsUncommissioned > 0 && (
              <div className="text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="size-3.5 shrink-0" />
                {summary.dealsMissingSplits - summary.dealsUncommissioned} deal
                {summary.dealsMissingSplits - summary.dealsUncommissioned === 1
                  ? ""
                  : "s"}{" "}
                with no explicit split — paid at the team default.
              </div>
            )}
          </div>
        )}

        {/* Payout checklist controls: basis toggle + mark-all. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs">
            <span className="text-muted-foreground">Payout checklist · </span>
            <span className="font-medium">
              {paidCount}/{lines.length} paid this month
            </span>
          </p>
          <div className="flex items-center gap-2">
            <div className="bg-secondary/60 inline-flex rounded-lg border p-0.5 text-xs">
              {basisTab("cash_collected", "Cash collected")}
              {basisTab("deal_revenue", "Deal revenue")}
            </div>
            {paidCount < lines.length && <MarkAllButton />}
          </div>
        </div>
      </Panel>

      <Panel title="Who gets paid" padded={false}>
        <DataTable
          columns={columns}
          rows={lines}
          getRowKey={(r) => r.repId}
          caption="Commission owed by participant"
        />
      </Panel>
    </motion.div>
  );
}
