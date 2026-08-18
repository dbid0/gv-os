"use client";

import { BarChart3, CircleDollarSign, Download, Users } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Kpi, Metric, Money } from "@/components/ui/metric";
import { Panel, Row, Rows } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import { DataTable, TableEmpty, type Column } from "@/components/ui/table";
import { cents, fromDollars } from "@/lib/money";
import { allocate } from "@/lib/splits";

/**
 * The living style guide.
 *
 * Every primitive on one page, so the language can be judged as a whole rather
 * than a component at a time, and so a change that breaks the look is obvious.
 *
 * The figures here are ILLUSTRATIVE and say so. This is the one place invented
 * numbers are allowed, because the page is about the components, not the money.
 */

type DemoRow = {
  id: string;
  client: string;
  type: string;
  net: number;
  daniel: number;
  gus: number;
  status: StatusTone;
  statusLabel: string;
};

// Amounts run through the real allocator, so the split shown is genuinely
// penny-exact rather than hand-typed to look right.
function demoRow(
  id: string,
  client: string,
  type: string,
  dollars: string,
  bps: number,
  status: StatusTone,
  statusLabel: string,
): DemoRow {
  const net = fromDollars(dollars);
  const [daniel, gus] = allocate(net, [bps, 10_000 - bps]);
  return { id, client, type, net, daniel, gus, status, statusLabel };
}

const rows: DemoRow[] = [
  demoRow("1", "Example One", "Setup", "4850.00", 5000, "live", "Paid out"),
  demoRow("2", "Example Two", "Rev-Share", "1358.99", 5000, "pending", "Not yet"),
  demoRow("3", "Example Three", "DFY Build", "12000.00", 4500, "live", "Paid out"),
  demoRow("4", "Example Four", "Client Handoff", "997.00", 5000, "muted", "Draft"),
];

const columns: Column<DemoRow>[] = [
  {
    key: "client",
    header: "Client",
    sortBy: (r) => r.client,
    render: (r) => <span className="font-medium">{r.client}</span>,
  },
  { key: "type", header: "Type", sortBy: (r) => r.type, render: (r) => r.type },
  {
    key: "net",
    header: "Net cash",
    numeric: true,
    sortBy: (r) => r.net,
    render: (r) => <Money amount={cents(r.net)} />,
  },
  {
    key: "daniel",
    header: "Daniel",
    numeric: true,
    sortBy: (r) => r.daniel,
    render: (r) => <Money amount={cents(r.daniel)} />,
  },
  {
    key: "gus",
    header: "Gus",
    numeric: true,
    sortBy: (r) => r.gus,
    render: (r) => <Money amount={cents(r.gus)} />,
  },
  {
    key: "status",
    header: "Status",
    render: (r) => <StatusPill tone={r.status}>{r.statusLabel}</StatusPill>,
  },
];

const tones: { tone: StatusTone; label: string }[] = [
  { tone: "live", label: "Live" },
  { tone: "active", label: "Active" },
  { tone: "pending", label: "Pending" },
  { tone: "muted", label: "Draft" },
  { tone: "danger", label: "Failed" },
];

export function SystemGallery() {
  const [view, setView] = useState("components");

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="The GV OS"
        highlight="design system."
        description="Every primitive in one place. Figures on this page are illustrative, not real."
        status={<StatusPill tone="active">Reference</StatusPill>}
        actions={
          <Button variant="outline" size="sm" disabled className="gap-2">
            <Download className="size-3.5" /> Export tokens
          </Button>
        }
      />

      <Segmented
        ariaLabel="Gallery view"
        value={view}
        onChange={setView}
        segments={[
          { value: "components", label: "Components", icon: BarChart3 },
          { value: "money", label: "Money", icon: CircleDollarSign },
          { value: "team", label: "Team", icon: Users },
        ]}
      />

      <Panel title="Status vocabulary">
        <div className="flex flex-wrap gap-2">
          {tones.map((t) => (
            <StatusPill key={t.tone} tone={t.tone}>
              {t.label}
            </StatusPill>
          ))}
        </div>
        <p className="text-muted-foreground mt-4 text-xs">
          Only <span className="text-brand">live</span> carries the brand colour.
          Everything else steps by brightness, so attention stays scarce.
        </p>
      </Panel>

      <Panel title="Figures">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Cash collected"
            icon={CircleDollarSign}
            tone="brand"
            value={<Money amount={fromDollars("31199.00")} />}
          />
          <Kpi
            label="Revenue"
            icon={BarChart3}
            tone="success"
            value={<Money amount={fromDollars("40202.00")} />}
          />
          <Kpi label="Deals closed" icon={Users} tone="warning" value="17" />
          <Kpi label="Close rate" tone="default" pending />
        </div>
      </Panel>

      <Panel title="Table" padded={false}>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          caption="Illustrative deals"
          empty={<TableEmpty title="Nothing here yet" />}
        />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Loading">
          <div className="space-y-3">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </Panel>

        <Panel title="Empty tile" padded={false}>
          <Rows>
            <Row>
              <Metric label="Rev share owed" pending="Accounting" />
            </Row>
            <Row>
              <Metric
                label="Cash collected"
                value={<Money amount={fromDollars("25048.15")} />}
                hint="July, illustrative"
              />
            </Row>
          </Rows>
        </Panel>
      </div>

      <Panel title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button className="press">Primary</Button>
          <Button variant="outline" className="press">
            Outline
          </Button>
          <Button variant="ghost" className="press">
            Ghost
          </Button>
          <Button variant="destructive" className="press">
            Destructive
          </Button>
          <Button disabled>Disabled</Button>
        </div>
      </Panel>
    </div>
  );
}
