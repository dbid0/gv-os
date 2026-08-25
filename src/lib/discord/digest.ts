import {
  GV_BRAND_COLOR,
  usdWhole,
  type DiscordEmbedField,
  type DiscordMessage,
} from "@/lib/discord/embed";

/**
 * The huddle digest a teammate reads in Discord — month cash, the funnel, the
 * top reps, AR owed, and a red flag if the reconciler is drifting. Pure, so the
 * broadcast is testable to the character. Deliberately NO rep pay or
 * commissions — that is the private accounting side, never a team post.
 */

const DRIFT_RED = 0xe5484d;

export interface DigestStats {
  monthLabel: string;
  monthCashCents: number;
  /** Top reps by cash — name, cash, deals. Already sliced/sorted by the caller. */
  topReps: { name: string; cashCents: number; deals: number }[];
  funnel: {
    setsBooked: number;
    shows: number;
    deals: number;
    closeRatePct: number | null;
  };
  arOwedCents: number;
  driftCount: number;
  driftTotalCents: number;
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

export function buildDigestMessage(s: DigestStats): DiscordMessage {
  const fields: DiscordEmbedField[] = [
    {
      name: "Funnel",
      value: `${s.funnel.setsBooked.toLocaleString("en-US")} sets → ${s.funnel.shows.toLocaleString("en-US")} shows → ${s.funnel.deals.toLocaleString("en-US")} deals (${pct(s.funnel.closeRatePct)} close)`,
    },
    {
      name: "Top reps",
      value:
        s.topReps.length > 0
          ? s.topReps
              .map((r) => `**${r.name}** — ${usdWhole(r.cashCents)} (${r.deals})`)
              .join("\n")
          : "No rep activity yet",
    },
    { name: "AR owed", value: usdWhole(s.arOwedCents), inline: true },
  ];

  if (s.driftCount > 0) {
    fields.push({
      name: "⚠️ Reconciler drift",
      value: `${s.driftCount} book${s.driftCount === 1 ? "" : "s"} off by ${usdWhole(s.driftTotalCents)} — check Accounting → Reconciliation.`,
    });
  }

  return {
    embeds: [
      {
        title: "📋 Global Ventures — huddle digest",
        description: `**${usdWhole(s.monthCashCents)}** collected in ${s.monthLabel}`,
        color: s.driftCount > 0 ? DRIFT_RED : GV_BRAND_COLOR,
        fields,
        footer: { text: "GV OS" },
      },
    ],
  };
}
