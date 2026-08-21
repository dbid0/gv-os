"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A download-CSV button, built client-side from rows already on the page.
 *
 * Values are properly escaped (quotes, commas, newlines) so a customer name
 * with a comma can't shift a column. Money should be passed as plain dollar
 * strings by the caller — a spreadsheet is where reconciliation happens, so the
 * export must open clean in one.
 */
export function ExportCsv({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  function download() {
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={download}
      disabled={rows.length === 0}
    >
      <Download className="size-3.5" /> Export CSV
    </Button>
  );
}
