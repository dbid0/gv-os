import { leadStatusTone, type LeadStatusTone } from "@/lib/tracking/lead-status";
import { cn } from "@/lib/utils";

/**
 * A sheet status cell as a coloured chip. The WORDS are the sheet's own,
 * verbatim — only the colour is interpreted (lib/tracking/lead-status), and
 * unknown wording stays neutral rather than guessing.
 */
const TONE_CLASS: Record<LeadStatusTone, string> = {
  success: "text-success border-success/30 bg-success/5",
  brand: "text-brand border-brand/30 bg-brand-soft/30",
  warning: "text-warning border-warning/30 bg-warning/5",
  danger: "text-destructive border-destructive/30 bg-destructive/5",
  neutral: "text-muted-foreground border-border",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs",
        TONE_CLASS[leadStatusTone(status)],
      )}
    >
      {status}
    </span>
  );
}
