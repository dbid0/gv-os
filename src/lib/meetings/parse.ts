/**
 * Pure mapping from the notetaker's distilled call output to Work-board tasks.
 *
 * The cloud notetaker distills each call into `{ person, tasks[] }` groups (see
 * notetaker/process_call). This module resolves each `person` to a roster
 * member and each task to an optional client, with zero I/O — so the fiddly
 * name-matching is unit-tested rather than discovered in production. The ingest
 * route does the inserts; this decides who owns what.
 */

export interface RosterMember {
  id: string;
  name: string;
}

export interface ClientRef {
  id: string;
  name: string;
  slug: string;
  /** Extra names the call might use — "Grid", "Tico" — beyond name/slug. */
  aliases?: string[];
}

export interface DistilledItem {
  person: string;
  tasks: string[];
}

export interface PlannedTask {
  title: string;
  /** Roster member this belongs to, when the name resolves; else null. */
  assigneeId: string | null;
  /** The name as the call labeled it — kept for display when unresolved. */
  person: string;
  /** Set when the task clearly names one client; else agency scope (null). */
  clientId: string | null;
}

/** Names that mean "nobody in particular" — never matched to a member. */
const UNASSIGNED = new Set([
  "team",
  "team unassigned",
  "unassigned",
  "everyone",
  "all",
  "group",
  "",
]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Whole-word-ish containment on already-normalized strings. */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const padded = ` ${haystack} `;
  return padded.includes(` ${needle} `);
}

/**
 * Resolve a distilled `person` label to a team member id.
 *
 * Tries, in order: exact full-name, then first-name (either direction, so
 * "Cosmo" hits "Cosmo Rossi" and "Daniel B." hits "Daniel"). Sentinel group
 * labels and unknown names return null — the ingest route keeps the raw label
 * as free-text so the task still shows who it's for.
 */
export function matchMember(person: string, members: RosterMember[]): string | null {
  const p = normalize(person);
  if (UNASSIGNED.has(p)) return null;

  const exact = members.find((m) => normalize(m.name) === p);
  if (exact) return exact.id;

  const first = p.split(" ")[0];
  const byFirst = members.find((m) => {
    const mn = normalize(m.name);
    const mFirst = mn.split(" ")[0];
    return mFirst === first || mn === first || mFirst === p;
  });
  return byFirst?.id ?? null;
}

/** Detect a single client named in free text; first roster match wins. */
export function detectClient(text: string, clients: ClientRef[]): string | null {
  const t = normalize(text);
  for (const c of clients) {
    const needles = [c.name, c.slug.replace(/-/g, " "), ...(c.aliases ?? [])]
      .map(normalize)
      .filter((n) => n.length >= 3);
    if (needles.some((n) => containsWord(t, n))) return c.id;
  }
  return null;
}

/** Flatten distilled items into per-task plans, resolving owner + client. */
export function planTasks(
  items: DistilledItem[],
  members: RosterMember[],
  clients: ClientRef[],
): PlannedTask[] {
  const out: PlannedTask[] = [];
  for (const item of items ?? []) {
    const assigneeId = matchMember(item.person ?? "", members);
    for (const raw of item.tasks ?? []) {
      const title = raw.trim().slice(0, 300);
      if (!title) continue;
      out.push({
        title,
        assigneeId,
        person: item.person ?? "",
        clientId: detectClient(title, clients),
      });
    }
  }
  return out;
}
