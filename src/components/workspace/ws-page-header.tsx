import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The workspace page opener — the reference anatomy: an icon chip, the page
 * name, and ONE sentence that teaches the page in place. Every workspace
 * surface starts with this, so a client who has never seen the tool reads
 * what a page is for without leaving it. `aside` holds the page's config
 * affordances (buttons, chips) on the title row.
 */
export function WsPageHeader({
  icon: Icon,
  title,
  lede,
  aside,
}: {
  icon: LucideIcon;
  title: string;
  /** One sentence, plain voice, teaching what this page is and where its
   * data comes from. Not a subtitle — an explanation. */
  lede: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="bg-secondary/60 mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border">
          <Icon className="text-brand size-4.5" />
        </span>
        <div>
          <h1 className="text-gradient-brand text-xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="text-muted-foreground mt-0.5 max-w-3xl text-sm">{lede}</p>
        </div>
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </div>
  );
}
