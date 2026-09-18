/**
 * EVERY OUTBOUND CALL ENDS.
 *
 * None of the integration pulls had a time bound. A remote host that accepts
 * the connection and then never answers is the worst failure mode there is:
 * it does not error, so nothing retries, nothing logs, and nothing falls back
 * — the caller simply waits.
 *
 * Two places that bites:
 *
 *   - Opening Accounting pulls the finance sheet inside the request when the
 *     mirror has gone stale. An unbounded read held the page open until the
 *     platform killed the function: a spinner, then a 504, instead of the
 *     fail-soft path that already exists and shows the last good mirror.
 *   - The scheduled sync runs every connected integration in ONE function
 *     invocation. One hung provider eats the whole budget, so the pulls after
 *     it never run — and their data silently goes stale while the run still
 *     reports success for everything before it.
 *
 * A bound turns both into an ordinary error: the fail-soft path runs, the
 * connection's note says what happened, and the next pull tries again.
 *
 * GENEROUS BY DEFAULT. These are guards against hanging, not latency budgets.
 * A slow-but-working provider must still succeed, so the default is well past
 * anything a healthy call takes; a caller that knows it is inside a page
 * render passes something tighter.
 */

/** Long enough that a slow, healthy call still completes. */
export const DEFAULT_TIMEOUT_MS = 20_000;

/** True for the error an aborted fetch throws. */
export function isTimeoutError(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

/**
 * `fetch`, with a deadline.
 *
 * On a timeout this throws a plain Error naming the host and the budget. The
 * raw abort is a DOMException whose message is empty or "signal is aborted
 * without reason", which would land verbatim in an integration's sync note
 * and tell the reader nothing.
 */
export async function timeoutFetch(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (isTimeoutError(e)) {
      throw new Error(
        `${hostOf(input)} did not respond within ${Math.round(timeoutMs / 1000)}s.`,
      );
    }
    throw e;
  }
}

/** The host, for a readable message — never the full URL, which can carry a key. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "The provider";
  }
}
