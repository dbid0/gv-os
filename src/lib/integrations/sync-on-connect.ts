import "server-only";

import { pullCalendlyBookings } from "@/lib/bookings/capture";
import { pullCloseActivity } from "@/lib/crm/close-sync";
import { pullPandaDocSigned, pullTypeformApplications } from "@/lib/docs/sync";
import { pullKitSnapshots } from "@/lib/email/kit-sync";
import { pullStripeEvents } from "@/lib/payments/capture";

/** Provider → its pull, the same functions the scheduled all-pulls job runs. */
const PULLS: Record<string, () => Promise<unknown>> = {
  kit: pullKitSnapshots,
  close: pullCloseActivity,
  calendly: pullCalendlyBookings,
  typeform: pullTypeformApplications,
  pandadoc: pullPandaDocSigned,
  stripe: pullStripeEvents,
};

/**
 * Pull a provider's data right away, the moment it's connected, so the app is
 * populated without waiting for the next scheduled run — "connected means it's
 * already loading." Fail-soft: a bad key or a slow API never breaks the connect;
 * the scheduled job and the connection card's sync note surface any real error.
 * No-op for providers with no pull engine.
 */
export async function syncProviderNow(provider: string): Promise<void> {
  const fn = PULLS[provider];
  if (!fn) return;
  try {
    await fn();
  } catch {
    // Intentionally swallowed — the connection still saved.
  }
}
