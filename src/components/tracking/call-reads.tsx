import Link from "next/link";

/**
 * Why calls went the way they did — the manager's read of the floor.
 *
 * Daniel asked for the end-of-call form to lead somewhere: pull the transcript,
 * work out why it didn't close, put it in front of the sales manager. This is
 * that last step. Each row is one call: the outcome first, then the coaching,
 * because a manager scanning this wants the pattern across reps, not a
 * transcript.
 */
export function CallReads({
  reads,
  slug,
}: {
  reads: {
    id: string;
    title: string | null;
    occurredAt: Date | null;
    participants: string[];
    outcome: string | null;
    analysis: Record<string, unknown>;
  }[];
  slug: string;
}) {
  if (reads.length === 0) {
    return (
      <p className="text-faint py-8 text-center text-sm">
        No calls have been read yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {reads.map((r) => {
        const a = r.analysis as { coaching?: string[]; objections?: string[] };
        const rep = r.participants[0] ?? null;
        const lead = r.participants[1] ?? null;
        return (
          <div key={r.id} className="border-b pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-medium">{rep ?? "Unknown rep"}</span>
              {lead && (
                <Link
                  href={`/w/${slug}/leads/${encodeURIComponent(lead)}`}
                  className="text-brand text-xs hover:underline"
                >
                  {lead}
                </Link>
              )}
              <span className="text-faint text-xs">
                {r.occurredAt
                  ? r.occurredAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : "no date"}
              </span>
            </div>
            <p className="mt-1 text-sm">{r.outcome}</p>
            {a.coaching && a.coaching.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {a.coaching.slice(0, 2).map((c) => (
                  <li key={c} className="text-muted-foreground text-xs">
                    · {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
