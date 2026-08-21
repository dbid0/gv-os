import "server-only";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { clients, integrations, paymentEvents } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";
import { normalizePayment, normalizeStripe } from "@/lib/payments/normalize";

/**
 * Payment capture: webhooks and pulls land processor events in
 * `app.payment_events`, idempotent on (provider, external_id). Never the
 * ledger — see the schema comment.
 */

/** Find the connected payments integration a webhook token belongs to. */
export async function integrationForWebhookToken(token: string) {
  if (!/^[a-f0-9]{32,64}$/.test(token)) return null;
  const db = getDb();
  const rows = await db
    .select({
      id: integrations.id,
      provider: integrations.provider,
      clientId: integrations.clientId,
      config: integrations.config,
    })
    .from(integrations)
    .where(eq(integrations.status, "connected"));
  return (
    rows.find(
      (r) => (r.config as { webhook_token?: string }).webhook_token === token,
    ) ?? null
  );
}

export interface CaptureResult {
  captured: boolean;
  reason: "new" | "duplicate" | "unparseable";
}

/** Store one normalized event. Duplicate external ids are silently kept once. */
export async function capturePayment(
  integration: { id: string; provider: string; clientId: string | null },
  payload: Record<string, unknown>,
): Promise<CaptureResult> {
  const normalized = normalizePayment(integration.provider, payload);
  if (!normalized) return { captured: false, reason: "unparseable" };
  const db = getDb();
  const inserted = await db
    .insert(paymentEvents)
    .values({
      integrationId: integration.id,
      provider: integration.provider,
      externalId: normalized.externalId,
      clientId: integration.clientId,
      kind: normalized.kind,
      amountCents: normalized.amountCents,
      currency: normalized.currency,
      email: normalized.email,
      occurredAt: normalized.occurredAt ? new Date(normalized.occurredAt) : null,
      label: normalized.label,
      raw: payload,
    })
    .onConflictDoNothing({
      target: [paymentEvents.provider, paymentEvents.externalId],
    })
    .returning({ id: paymentEvents.id });
  return {
    captured: inserted.length > 0,
    reason: inserted.length > 0 ? "new" : "duplicate",
  };
}

/**
 * Pull recent Stripe events through a sealed vault key. Runs for every
 * connected stripe integration; returns per-connection capture counts.
 */
export async function pullStripeEvents(): Promise<
  { integrationId: string; fetched: number; captured: number }[]
> {
  const key = serverEnv().CREDENTIALS_KEY;
  if (!key) throw new Error("CREDENTIALS_KEY is not set — cannot open the vault.");
  const db = getDb();
  const connections = await db
    .select({
      id: integrations.id,
      clientId: integrations.clientId,
      secretBox: integrations.secretBox,
    })
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "stripe"),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    );

  const results = [];
  for (const conn of connections) {
    const apiKey = open(conn.secretBox as string, key);
    const res = await fetch(
      "https://api.stripe.com/v1/events?limit=100&types[]=charge.succeeded&types[]=charge.refunded&types[]=charge.dispute.created",
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        },
      },
    );
    if (!res.ok) {
      throw new Error(`Stripe events pull failed (${res.status}): ${await res.text()}`);
    }
    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    const events = body.data ?? [];
    let captured = 0;
    for (const event of events) {
      if (!normalizeStripe(event)) continue;
      const out = await capturePayment(
        { id: conn.id, provider: "stripe", clientId: conn.clientId },
        event,
      );
      if (out.captured) captured += 1;
    }
    await db
      .update(integrations)
      .set({
        lastSyncAt: new Date(),
        lastSyncNote: `pulled ${events.length}, captured ${captured} new`,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, conn.id));
    results.push({ integrationId: conn.id, fetched: events.length, captured });
  }
  return results;
}

export interface PaymentEventRow {
  id: string;
  provider: string;
  clientName: string | null;
  kind: string;
  amountCents: number;
  currency: string;
  email: string | null;
  occurredAt: Date | null;
  label: string | null;
  status: string;
  createdAt: Date;
}

/** Recent captured events for the payments inbox. */
export async function listPaymentEvents(limit = 100): Promise<PaymentEventRow[]> {
  const db = getDb();
  return db
    .select({
      id: paymentEvents.id,
      provider: paymentEvents.provider,
      clientName: clients.name,
      kind: paymentEvents.kind,
      amountCents: paymentEvents.amountCents,
      currency: paymentEvents.currency,
      email: paymentEvents.email,
      occurredAt: paymentEvents.occurredAt,
      label: paymentEvents.label,
      status: paymentEvents.status,
      createdAt: paymentEvents.createdAt,
    })
    .from(paymentEvents)
    .leftJoin(clients, eq(paymentEvents.clientId, clients.id))
    .orderBy(
      desc(sql`coalesce(${paymentEvents.occurredAt}, ${paymentEvents.createdAt})`),
    )
    .limit(limit);
}
