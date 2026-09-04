"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  PhoneCall,
  Plus,
  Sparkles,
  Trophy,
  Video,
} from "lucide-react";

import { Kpi } from "@/components/ui/metric";
import { Panel } from "@/components/ui/panel";
import { StatusPill, type StatusTone } from "@/components/ui/status";
import { buttonVariants } from "@/components/ui/button";
import { DataTable, TableEmpty, type Column } from "@/components/ui/table";
import { fadeUp, stagger } from "@/lib/motion";
import {
  callTypeLabel,
  dispositionDef,
  dispositionLabel,
  summarizeActivity,
  type DispositionOutcome,
} from "@/lib/sales/call-activity";
import { cn } from "@/lib/utils";
import { useEntranceOnce } from "@/lib/client-state";

/**
 * The Call History view: RepVision's Call Library, as logged rows.
 *
 * Every figure is real — the KPIs are derived from the filtered rows through the
 * pure, fully covered call-activity module, and the table shows exactly what was
 * logged. Team, rep, and disposition filter the same rows client-side, so
 * changing a filter never refetches the page.
 */

export interface CallLogViewRow {
  id: string;
  mode: string;
  clientId: string;
  teamName: string;
  repId: string | null;
  repName: string;
  repRole: string | null;
  callType: string | null;
  disposition: string;
  recordingUrl: string | null;
  leadUrl: string | null;
  customerName: string;
  /** A short overview of what happened on the call (the logged notes). */
  overview: string | null;
  when: string;
  occurredAtMs: number;
}

interface TeamOption {
  id: string;
  name: string;
}
interface RepOption {
  id: string;
  name: string;
  clientId: string;
}

const OUTCOME_TONE: Record<DispositionOutcome, StatusTone> = {
  won: "good",
  progress: "progress",
  lost: "muted",
};

const selectClass =
  "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

const CreateButton = (
  <Link
    href="/sales/call-log/new"
    className={cn(buttonVariants({ size: "sm" }), "gap-2")}
  >
    <Plus className="size-3.5" /> Log activity
  </Link>
);

export function CallHistoryView({
  rows,
  teams,
  reps,
}: {
  rows: CallLogViewRow[];
  teams: TeamOption[];
  reps: RepOption[];
}) {
  const reduceMotion = useReducedMotion();
  const entrance = useEntranceOnce();
  const [team, setTeam] = useState("");
  const [rep, setRep] = useState("");
  const [disposition, setDisposition] = useState("");

  const repChoices = useMemo(
    () => (team ? reps.filter((r) => r.clientId === team) : reps),
    [reps, team],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!team || r.clientId === team) &&
          (!rep || r.repId === rep) &&
          (!disposition || r.disposition === disposition),
      ),
    [rows, team, rep, disposition],
  );

  const stats = useMemo(
    () =>
      summarizeActivity(
        filtered.map((r) => ({
          repId: r.repId,
          mode: r.mode,
          disposition: r.disposition,
        })),
      ),
    [filtered],
  );

  const columns: Column<CallLogViewRow>[] = [
    {
      key: "when",
      header: "When",
      sortBy: (r) => r.occurredAtMs,
      render: (r) => (
        <span className="text-muted-foreground whitespace-nowrap">{r.when}</span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {r.mode === "booking" ? (
            <CalendarPlus className="text-faint size-3.5" />
          ) : (
            <PhoneCall className="text-faint size-3.5" />
          )}
          {r.callType
            ? callTypeLabel(r.callType)
            : r.mode === "booking"
              ? "Booking"
              : "Call"}
        </span>
      ),
    },
    {
      key: "rep",
      header: "Rep",
      sortBy: (r) => r.repName,
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.repName}</div>
          <div className="text-faint text-xs">{r.teamName}</div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (r) => r.customerName,
    },
    {
      key: "disposition",
      header: "Disposition",
      sortBy: (r) => r.disposition,
      render: (r) => {
        const def = dispositionDef(r.disposition);
        return (
          <StatusPill tone={def ? OUTCOME_TONE[def.outcome] : "pending"}>
            {dispositionLabel(r.disposition)}
          </StatusPill>
        );
      },
    },
    {
      key: "overview",
      header: "Overview",
      render: (r) =>
        r.overview ? (
          <span
            title={r.overview}
            className="text-muted-foreground block max-w-[22rem] truncate"
          >
            {r.overview}
          </span>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "links",
      header: "Links",
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          {r.recordingUrl && (
            <a
              href={r.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Recording"
            >
              <Video className="size-4" />
            </a>
          )}
          {r.leadUrl && (
            <a
              href={r.leadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Lead / CRM"
            >
              <ExternalLink className="size-4" />
            </a>
          )}
          {!r.recordingUrl && !r.leadUrl && <span className="text-faint">—</span>}
        </span>
      ),
    },
  ];

  // Transcripts already arrive — through the share link a closer pastes on the
  // end-of-call form, no Fathom key involved. This panel used to say "waiting
  // on go-live", which stopped being true the day that shipped. What a Fathom
  // API key would still add is calls nobody pasted a link for.
  const fathomStub = (
    <Panel
      title="Call recordings"
      aside={<StatusPill tone="good">Arriving from EOC reports</StatusPill>}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted-foreground max-w-xl text-sm">
          Every end-of-call report with a Fathom share link has its transcript pulled
          and read — see Call Reviews. Connecting a Fathom API key would add the calls
          nobody pasted a link for; until then, nothing is imported and no call is
          invented.
        </p>
        <Link
          href="/sales/call-reviews"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
        >
          <Sparkles className="size-3.5" /> Open call reviews
        </Link>
      </div>
    </Panel>
  );

  // The whole feature is empty: an honest, actionable empty state, not zeros.
  if (rows.length === 0) {
    return (
      <motion.div
        initial={reduceMotion || !entrance ? false : "hidden"}
        animate="visible"
        variants={stagger()}
        className="space-y-6"
      >
        <motion.div variants={fadeUp}>
          <Panel
            title="Call history"
            aside={<StatusPill tone="pending">No activity yet</StatusPill>}
          >
            <div className="py-8">
              <TableEmpty
                title="No calls logged yet"
                detail="Log a call or a booking and it lands here, newest first. Every disposition feeds rep activity metrics — nothing on this page is a guess."
                action={CreateButton}
              />
            </div>
          </Panel>
        </motion.div>
        <motion.div variants={fadeUp}>{fathomStub}</motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={reduceMotion || !entrance ? false : "hidden"}
      animate="visible"
      variants={stagger()}
      className="space-y-6"
    >
      <motion.div variants={fadeUp}>
        <Panel title="Logged activity" aside={CreateButton}>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Logged"
              value={stats.logged.toLocaleString("en-US")}
              icon={PhoneCall}
              tone="brand"
            />
            <Kpi
              label="Shows"
              value={stats.shows.toLocaleString("en-US")}
              icon={Trophy}
              tone="default"
            />
            <Kpi
              label="Sales closed"
              value={stats.sales.toLocaleString("en-US")}
              icon={CheckCircle2}
              tone="success"
            />
            <Kpi
              label="Close rate"
              value={pct(stats.closeRate)}
              icon={Sparkles}
              tone="default"
            />
          </div>
        </Panel>
      </motion.div>

      <motion.div variants={fadeUp} className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selectClass}
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setRep("");
            }}
            aria-label="Filter by team"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            className={selectClass}
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            aria-label="Filter by rep"
          >
            <option value="">All reps</option>
            {repChoices.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <select
            className={selectClass}
            value={disposition}
            onChange={(e) => setDisposition(e.target.value)}
            aria-label="Filter by disposition"
          >
            <option value="">All dispositions</option>
            {[...new Set(rows.map((r) => r.disposition))].map((d) => (
              <option key={d} value={d}>
                {dispositionLabel(d)}
              </option>
            ))}
          </select>
        </div>

        <Panel
          title="Call history"
          aside={<span className="text-faint text-xs">{filtered.length} shown</span>}
          padded={false}
        >
          <DataTable
            columns={columns}
            rows={filtered}
            getRowKey={(r) => r.id}
            caption="Logged calls and bookings"
            empty={
              <TableEmpty
                title="No activity matches"
                detail="Clear a filter to see more logged calls and bookings."
              />
            }
          />
        </Panel>
      </motion.div>

      <motion.div variants={fadeUp}>{fathomStub}</motion.div>
    </motion.div>
  );
}
