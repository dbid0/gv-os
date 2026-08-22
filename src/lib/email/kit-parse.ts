/**
 * Kit v4 response parsers — pure. The v4 API nests lists under a plural key
 * and paginates with cursors; these squeeze what the snapshot needs out of
 * whatever shape arrives, defensively, without ever throwing on a missing
 * field. (Auth, pagination, and rate-limit lore: INTEGRATIONS-API-PLAYBOOK.)
 */

type Payload = Record<string, unknown>;

export interface KitSequence {
  id: number;
  name: string;
  hold?: boolean;
}

const asArray = (v: unknown): Payload[] =>
  Array.isArray(v)
    ? (v.filter((x) => typeof x === "object" && x !== null) as Payload[])
    : [];

/** `GET /v4/sequences` → the sequence list the snapshot stores. */
export function parseKitSequences(body: unknown): KitSequence[] {
  const root = (body ?? {}) as Payload;
  return asArray(root.sequences)
    .map((s) => ({
      id: typeof s.id === "number" ? s.id : Number(s.id),
      name: typeof s.name === "string" ? s.name : "(unnamed)",
      ...(typeof s.hold === "boolean" ? { hold: s.hold } : {}),
    }))
    .filter((s) => Number.isFinite(s.id));
}

/** `GET /v4/tags` → count only; tag names don't need storing. */
export function parseKitTagCount(body: unknown): number {
  const root = (body ?? {}) as Payload;
  return asArray(root.tags).length;
}

/**
 * `GET /v4/subscribers?per_page=1&include_total_count=true` →
 * `pagination.total_count`, the point-in-time size of the whole list. Null
 * when the field is missing (older API shapes) — never a fake zero.
 */
export function parseKitSubscriberTotal(body: unknown): number | null {
  const root = (body ?? {}) as Payload;
  const pagination = (root.pagination ?? {}) as Payload;
  const total = pagination.total_count;
  return typeof total === "number" && Number.isFinite(total) && total >= 0
    ? total
    : null;
}

/** `GET /v4/account` → display name + plan, both optional. */
export function parseKitAccount(body: unknown): {
  name: string | null;
  plan: string | null;
} {
  const root = (body ?? {}) as Payload;
  const account = (root.account ?? root) as Payload;
  return {
    name: typeof account.name === "string" ? account.name : null,
    plan:
      typeof account.plan_type === "string"
        ? account.plan_type
        : typeof account.plan === "string"
          ? account.plan
          : null,
  };
}
