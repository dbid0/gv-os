/**
 * The fixed vocabulary of base activity fields an EOD template can turn on.
 *
 * These are the standard, typed sales-activity counts RepVision offers as
 * toggles when you build a template. A team layers its own `customFields` and
 * `calcFields` on top; these are the shared floor every role draws from, so the
 * submit form, the leaderboard columns, and the dashboard tiles all speak the
 * same field keys.
 *
 * Not server-only: the template builder (a client component) imports this too.
 */
export const BASE_EOD_FIELDS = [
  { key: "dials", label: "Dials" },
  { key: "connects", label: "Connects" },
  { key: "dms_sent", label: "DMs Sent" },
  { key: "sets_booked", label: "Sets Booked" },
  { key: "calls_taken", label: "Calls Taken" },
  { key: "shows", label: "Shows" },
  { key: "no_shows", label: "No Shows" },
  { key: "cancelled_calls", label: "Cancelled Calls" },
  { key: "follow_up_calls", label: "Follow-up Calls" },
] as const;

export type BaseEodFieldKey = (typeof BASE_EOD_FIELDS)[number]["key"];

export const BASE_EOD_FIELD_KEYS: string[] = BASE_EOD_FIELDS.map((f) => f.key);

export function baseFieldLabel(key: string): string {
  return BASE_EOD_FIELDS.find((f) => f.key === key)?.label ?? key;
}

export const EOD_ROLES = ["closer", "setter", "dm_setter", "manager"] as const;
export type EodRole = (typeof EOD_ROLES)[number];

// GV runs only two cadences: the end-of-day report and the beginning-of-day
// plan. There is no end-of-week form.
export const EOD_CADENCES = ["eod", "bod"] as const;
export type EodCadence = (typeof EOD_CADENCES)[number];

export const CADENCE_LABEL: Record<string, string> = {
  eod: "Daily (EOD)",
  bod: "Beginning of Day",
};

export const ROLE_LABEL: Record<string, string> = {
  closer: "Closer",
  setter: "Setter",
  dm_setter: "DM Setter",
  manager: "Manager",
};
