"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Print / Save-as-PDF the statement — the shareable artifact for a client. */
export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
      <Printer className="size-3.5" /> Print / Save PDF
    </Button>
  );
}
