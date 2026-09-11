"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Copies a link to the clipboard with a brief "Copied" confirmation.
 *
 * Never fails loudly: the Clipboard API can be denied by the browser, but
 * the assembled URL is always visible in the row it sits next to, so a
 * denial loses nothing — it just means a manual select-and-copy instead.
 */
export function CopyLinkButton({
  url,
  label = "Copy",
}: {
  url: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="gap-1"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard denied/unavailable — nothing lost, url is still on screen.
        }
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
