/**
 * Discord embed shapes for the agency sync — pure, no I/O, so the message a
 * teammate sees is testable to the character. The sender in `webhook.ts` does
 * the network; this file only decides what the post says.
 */

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

/** GV brand blue as a Discord integer color. */
export const GV_BRAND_COLOR = 0x52b7ff;

/** "$1,234,567" — whole dollars, for a Discord field where cents are noise. */
export function usdWhole(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;
}

export interface AgencySnapshot {
  monthLabel: string;
  monthCashCents: number;
  totalRevenueCents: number;
  dealsClosed: number;
  activeClients: number;
  /** yyyy-mm-ddThh:mm:ssZ — passed in, never read from the clock here (pure). */
  isoTimestamp?: string;
}

/**
 * The agency snapshot a teammate reads in Discord: this month's collected cash
 * up top, then the supporting figures as fields. Deliberately no rep names or
 * commissions — that is the private accounting side, not a team broadcast.
 */
export function buildAgencySnapshotEmbed(s: AgencySnapshot): DiscordMessage {
  return {
    embeds: [
      {
        title: "📊 Global Ventures — agency snapshot",
        description: `**${usdWhole(s.monthCashCents)}** collected in ${s.monthLabel}`,
        color: GV_BRAND_COLOR,
        fields: [
          {
            name: "Revenue booked",
            value: usdWhole(s.totalRevenueCents),
            inline: true,
          },
          {
            name: "Deals closed",
            value: s.dealsClosed.toLocaleString("en-US"),
            inline: true,
          },
          { name: "Active clients", value: String(s.activeClients), inline: true },
        ],
        footer: { text: "GV OS" },
        ...(s.isoTimestamp ? { timestamp: s.isoTimestamp } : {}),
      },
    ],
  };
}

/** The one-off "does the pipe work" message from Settings. */
export function buildTestMessage(): DiscordMessage {
  return {
    content: "✅ GV OS is connected to this channel — agency sync is live.",
  };
}
