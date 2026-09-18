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
  /**
   * How many emails the sequence contains, and how many people are in it.
   *
   * These were thrown away, which left a sequence as a name and a pill. That
   * is the difference between "Forever Nurture" reading as one more row and
   * reading as 47 emails going to real people — and on an account that sends
   * almost everything through sequences, it is the difference between a page
   * that describes the email program and one that does not.
   *
   * Optional because an older snapshot has neither, and a missing count is
   * unknown, never zero.
   */
  emailCount?: number;
  subscriberCount?: number;
}

/** A count Kit gave us, or undefined — never a fabricated zero. */
const count = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

const asArray = (v: unknown): Payload[] =>
  Array.isArray(v)
    ? (v.filter((x) => typeof x === "object" && x !== null) as Payload[])
    : [];

/** `GET /v4/sequences` → the sequence list the snapshot stores. */
export function parseKitSequences(body: unknown): KitSequence[] {
  const root = (body ?? {}) as Payload;
  return asArray(root.sequences)
    .map((s) => {
      const emailCount = count(s.email_count);
      const subscriberCount = count(s.subscriber_count);
      return {
        id: typeof s.id === "number" ? s.id : Number(s.id),
        name: typeof s.name === "string" ? s.name : "(unnamed)",
        ...(typeof s.hold === "boolean" ? { hold: s.hold } : {}),
        ...(emailCount === undefined ? {} : { emailCount }),
        ...(subscriberCount === undefined ? {} : { subscriberCount }),
      };
    })
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
