import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, integrations } from "@/db/schema/app";
import { open } from "@/lib/crypto/secretbox";
import { serverEnv } from "@/env.server";
import { writeSourceSnapshot } from "@/lib/tracking/ingest";
import { mapFields } from "@/lib/tracking/fields";
import { scanTab } from "@/lib/tracking/scan";
import { normalizeStripeCharges, type StripeCharge } from "@/lib/tracking/stripe";

/**
 * PULLING A CLIENT'S MONEY FROM STRIPE.
 *
 * One adapter among several. It turns Stripe's payload into rows and hands
 * them to the shared spine; it decides nothing about precedence. Stripe
 * already outranks the sheet for `payment` in lib/tracking/sources, so once
 * this runs the dashboard stops depending on someone remembering to log a
 * $49 renewal by hand.
 *
 * The key comes from the Integrations vault — connected in the UI, sealed
 * with the credentials key, per client. Nothing is hard-coded per machine:
 * connect Stripe for an offer on the Integrations page and this adapter
 * starts pulling on the next sync.
 */

/** Charges older than this are not pulled. Stripe paginates from newest. */
const MAX_PAGES = 40;
const PAGE_SIZE = 100;

export interface StripeSyncResult {
  syncId: string | null;
  chargeCount: number;
  rowCount: number;
  skippedForeign: number;
  /** Set when nothing could be pulled. Never a fabricated zero. */
  error: string | null;
}

function empty(error: string): StripeSyncResult {
  return { syncId: null, chargeCount: 0, rowCount: 0, skippedForeign: 0, error };
}

/**
 * The client's Stripe key, from the Integrations vault.
 *
 * Per client, because each offer collects into its own Stripe account, and a
 * single shared key would attribute every client's cash to whichever account
 * the key belonged to. Returns null when no connected Stripe integration
 * exists for the client — the caller renders that as an honest empty state.
 */
async function stripeKeyFor(clientId: string): Promise<string | null> {
  const credentialsKey = serverEnv().CREDENTIALS_KEY;
  if (!credentialsKey) return null;
  const db = getDb();
  const [conn] = await db
    .select({ secretBox: integrations.secretBox })
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "stripe"),
        eq(integrations.clientId, clientId),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    )
    .limit(1);
  if (!conn?.secretBox) return null;
  return open(conn.secretBox as string, credentialsKey);
}

/** Fetch every charge since `since`, newest first, following Stripe's cursor. */
export async function fetchStripeCharges(
  key: string,
  since: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<StripeCharge[]> {
  const out: StripeCharge[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL("https://api.stripe.com/v1/charges");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("created[gte]", String(Math.floor(since.getTime() / 1000)));
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const res = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      throw new Error(`Stripe returned ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { data: StripeCharge[]; has_more: boolean };
    out.push(...body.data);
    if (!body.has_more || body.data.length === 0) break;
    startingAfter = body.data[body.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return out;
}

export async function syncClientStripe(
  clientId: string,
  since: Date,
): Promise<StripeSyncResult> {
  const db = getDb();
  const [client] = await db
    .select({ id: clients.id, slug: clients.slug, name: clients.name })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) return empty("No such client.");

  const key = await stripeKeyFor(client.id);
  if (!key) {
    // Honest empty state. A missing connection means we do not know this
    // client's Stripe position — it does not mean the position is zero.
    return empty(
      `Stripe isn't connected for ${client.name} — connect it on the Integrations page to pull its payments.`,
    );
  }

  let charges: StripeCharge[];
  try {
    charges = await fetchStripeCharges(key, since);
  } catch (e) {
    return empty(
      `Could not reach Stripe: ${e instanceof Error ? e.message : "unknown error"}`,
    );
  }

  const { rows, skippedForeign } = normalizeStripeCharges(charges);
  const { syncId } = await writeSourceSnapshot({
    clientId,
    source: "stripe",
    connectionRef: "integrations:stripe",
    rows,
    // An API source has no sheet columns, so the field map is empty by
    // construction rather than by failing to find headers.
    tabs: [scanTab("payments", rows, mapFields([]), [])],
  });

  return {
    syncId,
    chargeCount: charges.length,
    rowCount: rows.length,
    skippedForeign: skippedForeign.length,
    error: null,
  };
}
