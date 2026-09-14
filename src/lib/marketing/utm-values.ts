/**
 * UTM VALUE MEMORY — the builder suggests what this team has already used.
 *
 * The SOP's whole point is consistency: "youtube" every time, never "YouTube"
 * one week and "yt" the next, or the attribution report splits one source into
 * three. Hardcoded suggestions only cover the platforms someone thought of in
 * advance; the registry already knows every value that actually went out.
 *
 * Order, per field:
 * 1. values used for the client being linked, most used first;
 * 2. then values used for other clients, most used first;
 * 3. then the built-in starter suggestions nobody has used yet.
 * Ties break on the most recent use, then alphabetically — so the list is
 * stable for the same registry.
 *
 * Destinations are remembered for the selected client only: another client's
 * funnel is never a sensible suggestion.
 *
 * Pure: no database.
 */

export type RememberedLink = {
  clientId: string;
  destinationUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  createdAt: Date;
};

export type UtmSuggestions = {
  source: string[];
  medium: string[];
  campaign: string[];
  destination: string[];
};

export const STARTER_SOURCES = ["youtube", "instagram", "tiktok", "email", "discord"];
export const STARTER_MEDIUMS = [
  "bio",
  "description",
  "profile",
  "story",
  "pinned-comment",
  "dm",
];

type Tally = { value: string; mine: number; all: number; last: number };

function rank(
  links: RememberedLink[],
  clientId: string,
  pick: (l: RememberedLink) => string,
  starters: string[],
  onlyMine = false,
): string[] {
  const tallies = new Map<string, Tally>();
  for (const l of links) {
    const value = pick(l).trim();
    if (!value) continue;
    const mine = l.clientId === clientId;
    if (onlyMine && !mine) continue;
    const t = tallies.get(value) ?? { value, mine: 0, all: 0, last: 0 };
    t.all += 1;
    if (mine) t.mine += 1;
    t.last = Math.max(t.last, l.createdAt.getTime());
    tallies.set(value, t);
  }
  const used = [...tallies.values()]
    .sort(
      (a, b) =>
        Number(b.mine > 0) - Number(a.mine > 0) ||
        b.mine - a.mine ||
        b.all - a.all ||
        b.last - a.last ||
        a.value.localeCompare(b.value),
    )
    .map((t) => t.value);
  return [...used, ...starters.filter((s) => !tallies.has(s))];
}

export function utmSuggestions(
  links: RememberedLink[],
  clientId: string,
): UtmSuggestions {
  return {
    source: rank(links, clientId, (l) => l.utmSource, STARTER_SOURCES),
    medium: rank(links, clientId, (l) => l.utmMedium, STARTER_MEDIUMS),
    campaign: rank(links, clientId, (l) => l.utmCampaign, []),
    destination: rank(links, clientId, (l) => l.destinationUrl, [], true),
  };
}
