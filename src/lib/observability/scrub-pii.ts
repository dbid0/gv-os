/**
 * Strips obvious PII (email addresses) out of a Sentry event before it
 * leaves the process, via each Sentry.init's `beforeSend`.
 *
 * Deliberately narrow — this is not a general PII scrubber, just enough to
 * keep raw emails out of error reports without over-engineering it. Typed
 * structurally against the slice of Sentry's Event shape it touches, rather
 * than importing @sentry/nextjs's Event type, so the same helper works
 * unchanged from the client, server, and edge config files even though each
 * one infers a slightly different Options/Event type for its own runtime.
 */

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function redact(value: string): string {
  return value.replace(EMAIL_PATTERN, "[redacted-email]");
}

export type ScrubbableEvent = {
  user?: { email?: string } | null;
  message?: string;
};

/** Mutates and returns the event, matching Sentry's `beforeSend` contract. */
export function scrubEmails<T extends ScrubbableEvent>(event: T): T {
  if (event.user?.email) {
    event.user.email = redact(event.user.email);
  }
  if (event.message) {
    event.message = redact(event.message);
  }
  return event;
}
