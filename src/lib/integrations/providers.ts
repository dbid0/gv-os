/**
 * The integration catalog — every tool GV OS connects to, grouped by what it
 * feeds. Pure data: the Integrations page, the connect form, and later each
 * sync job all render/dispatch from this one list, so adding a provider here
 * is the whole change until its sync lands.
 *
 * Source of truth for the lineup: TEAM-ACTIONS-INTEGRATIONS-PLAN.md (Daniel's
 * 8/20 brief).
 */

export type CredentialKind = "api_key" | "token" | "mcp_url";

export interface Provider {
  value: string;
  label: string;
  group: string;
  /** What the user pastes when connecting. */
  credential: CredentialKind;
  /** One line on what this connection will feed. */
  feeds: string;
}

export const PROVIDER_GROUPS = [
  "Payments",
  "Bookings",
  "Sales CRM",
  "Email",
  "DMs",
  "Docs",
  "Video",
  "Storage",
  "Comms",
  "Knowledge",
  "AI",
] as const;

export const PROVIDERS: Provider[] = [
  // Payments — straight into the money ledger, idempotent on event id.
  {
    value: "whop",
    label: "Whop",
    group: "Payments",
    credential: "api_key",
    feeds: "Payment events → ledger",
  },
  {
    value: "fanbasis",
    label: "Fanbasis",
    group: "Payments",
    credential: "api_key",
    feeds: "Payment events → ledger",
  },
  {
    value: "stripe",
    label: "Stripe",
    group: "Payments",
    credential: "api_key",
    feeds: "Payment events → ledger",
  },
  {
    value: "shopify",
    label: "Shopify",
    group: "Payments",
    credential: "api_key",
    feeds: "Payment events → ledger",
  },
  {
    value: "commas",
    label: "Commas",
    group: "Payments",
    credential: "api_key",
    feeds: "Payment events → ledger",
  },

  // Bookings — calls booked + applications, per offer.
  {
    value: "iclosed",
    label: "iClosed",
    group: "Bookings",
    credential: "api_key",
    feeds: "Calls booked per offer",
  },
  {
    value: "calendly",
    label: "Calendly",
    group: "Bookings",
    credential: "token",
    feeds: "Calls booked per offer",
  },
  {
    value: "typeform",
    label: "Typeform",
    group: "Bookings",
    credential: "token",
    feeds: "Applications in",
  },

  {
    value: "close",
    label: "Close CRM",
    group: "Sales CRM",
    credential: "api_key",
    feeds: "Rep dials, texts, calls, dispositions",
  },

  {
    value: "kit",
    label: "Kit",
    group: "Email",
    credential: "api_key",
    feeds: "Email performance per offer",
  },
  {
    value: "manychat",
    label: "ManyChat",
    group: "DMs",
    credential: "api_key",
    feeds: "DM / conversation overview",
  },
  {
    value: "pandadoc",
    label: "PandaDoc",
    group: "Docs",
    credential: "api_key",
    feeds: "Signed-agreement notifications",
  },

  {
    value: "vidalytics",
    label: "Vidalytics",
    group: "Video",
    credential: "api_key",
    feeds: "Funnel + VSL watch data",
  },
  {
    value: "wistia",
    label: "Wistia",
    group: "Video",
    credential: "token",
    feeds: "Funnel + VSL watch data",
  },

  {
    value: "google_drive",
    label: "Google Drive",
    group: "Storage",
    credential: "token",
    feeds: "Client asset drops → their section",
  },
  {
    value: "google_sheets",
    label: "Google Sheets",
    group: "Storage",
    credential: "token",
    feeds: "Mirror out — never source of truth",
  },

  {
    value: "slack",
    label: "Slack",
    group: "Comms",
    credential: "token",
    feeds: "Notifications (interim)",
  },
  {
    value: "discord",
    label: "Discord",
    group: "Comms",
    credential: "token",
    feeds: "Agency + client servers",
  },

  {
    value: "notion",
    label: "Notion",
    group: "Knowledge",
    credential: "token",
    feeds: "AI reads/edits pages",
  },

  {
    value: "mcp",
    label: "MCP server",
    group: "AI",
    credential: "mcp_url",
    feeds: "Tools for the AI layer (transcripts, call reviews)",
  },
];

export function providerByValue(value: string): Provider | undefined {
  return PROVIDERS.find((p) => p.value === value);
}

export const PROVIDER_VALUES = PROVIDERS.map((p) => p.value) as [string, ...string[]];

export const CREDENTIAL_LABELS: Record<CredentialKind, string> = {
  api_key: "API key",
  token: "Access token",
  mcp_url: "MCP endpoint URL",
};

/**
 * How a tool is connected — not every connection is an API key. Some tools push
 * to us (webhook), and some are set up outside GV OS and just tracked as
 * connected (manual). OAuth is intentionally absent until each provider's app
 * is registered — we never present a flow we can't actually complete.
 */
export type ConnectMethod = "api_key" | "webhook" | "manual";

export const CONNECT_METHODS: ConnectMethod[] = ["api_key", "webhook", "manual"];

export const METHOD_LABELS: Record<ConnectMethod, string> = {
  api_key: "API key",
  webhook: "Webhook",
  manual: "Manual",
};

export const METHOD_HINTS: Record<ConnectMethod, string> = {
  api_key: "Paste a key or token — sealed on save, never shown again.",
  webhook: "No key needed — we mint a URL for the tool to post events to.",
  manual: "Connected outside GV OS — record it here with an optional reference link.",
};

// Payments and Bookings tools can post events to a minted webhook URL; that is
// their most natural connection. Everything else is a pasted key. Any tool can
// also be marked connected manually.
const WEBHOOK_GROUPS = new Set(["Payments", "Bookings"]);

/** The connection methods a provider supports, best-first. */
export function methodsForProvider(provider: Provider): ConnectMethod[] {
  return WEBHOOK_GROUPS.has(provider.group)
    ? ["webhook", "api_key", "manual"]
    : ["api_key", "manual"];
}

/** The method a provider connects with by default (its best option). */
export function defaultMethod(provider: Provider): ConnectMethod {
  return methodsForProvider(provider)[0];
}

export function providerSupportsMethod(
  provider: Provider,
  method: ConnectMethod,
): boolean {
  return methodsForProvider(provider).includes(method);
}
