import {
  CallHistoryView,
  type CallLogViewRow,
} from "@/components/sales/call-history-view";
import { listCallLogs } from "@/lib/sales/call-queries";
import { listEodReps, listTeams } from "@/lib/sales/queries";

export const metadata = { title: "Call Log - GV OS" };
export const dynamic = "force-dynamic";

const fmtWhen = (d: Date) =>
  d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default async function SalesCallLogPage() {
  const [logs, teams, reps] = await Promise.all([
    listCallLogs(),
    listTeams(),
    listEodReps(),
  ]);

  const rows: CallLogViewRow[] = logs.map((l) => ({
    id: l.id,
    mode: l.mode,
    clientId: l.clientId,
    teamName: l.teamName ?? "—",
    repId: l.repId,
    repName: l.repName ?? "Unassigned",
    repRole: l.repRole,
    callType: l.callType,
    disposition: l.disposition,
    recordingUrl: l.recordingUrl,
    leadUrl: l.leadUrl,
    customerName: l.customerName ?? "—",
    overview: l.notes ?? null,
    when: fmtWhen(l.occurredAt),
    occurredAtMs: l.occurredAt.getTime(),
  }));

  return (
    <CallHistoryView
      rows={rows}
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      reps={reps.map((r) => ({ id: r.id, name: r.name, clientId: r.clientId }))}
    />
  );
}
