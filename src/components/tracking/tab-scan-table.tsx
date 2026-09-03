import type { TabScan } from "@/lib/tracking/scan";

const LABELS: Record<string, string> = {
  applications: "Applications",
  calls: "Calls Log",
  payments: "Payment Log",
  deals: "New Deals",
  ar: "Accounts Receivable",
  bod: "BOD",
  setter_eod: "Setter EOD",
  dm_setter_eod: "DM Setter EOD",
  closer_eod: "Closer EOD",
  eoc: "EOC Reports",
};

/**
 * What each tab of the sheet holds.
 *
 * "Dated" and "Identified" are shown beside the row count on purpose: they are
 * the real denominators. A tab of 109 rows with 7 dates cannot support a
 * per-day chart, and a tab with no emails cannot join to a lead — better to see
 * that here than to wonder why a dashboard looks thin.
 */
export function TabScanTable({ tabs }: { tabs: TabScan[] }) {
  if (tabs.length === 0) {
    return (
      <p className="text-faint py-8 text-center text-sm">
        No recognised tabs on this sheet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-faint border-b text-xs uppercase">
          <tr>
            <th className="py-2 pr-4 text-left font-medium">Tab</th>
            <th className="py-2 pr-4 text-right font-medium">Rows</th>
            <th className="py-2 pr-4 text-right font-medium">Dated</th>
            <th className="py-2 pr-4 text-right font-medium">With email</th>
            <th className="py-2 pr-4 text-right font-medium">Recordings</th>
            <th className="py-2 pr-4 text-left font-medium">Extra columns kept</th>
          </tr>
        </thead>
        <tbody>
          {tabs.map((t) => (
            <tr key={t.tab} className="border-b last:border-0">
              <td className="py-2 pr-4 font-medium">{LABELS[t.tab] ?? t.tab}</td>
              <td className="numeric py-2 pr-4 text-right">{t.rows}</td>
              <td
                className={`numeric py-2 pr-4 text-right ${
                  t.rows > 0 && t.dated < t.rows ? "text-warning" : ""
                }`}
              >
                {t.dated}
              </td>
              <td className="numeric text-muted-foreground py-2 pr-4 text-right">
                {t.identified}
              </td>
              <td className="numeric text-muted-foreground py-2 pr-4 text-right">
                {t.withRecording || "—"}
              </td>
              <td className="text-faint py-2 pr-4 text-xs">
                {t.unmappedColumns.length === 0
                  ? "—"
                  : t.unmappedColumns.slice(0, 4).join(" · ") +
                    (t.unmappedColumns.length > 4
                      ? ` +${t.unmappedColumns.length - 4}`
                      : "")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
