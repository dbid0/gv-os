import "server-only";

import { count, desc, eq, gte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { applications, clients, signedDocs } from "@/db/schema/app";

/** Captured funnel data shaped for the Applications view. */

export interface ApplicationRow {
  id: string;
  clientName: string | null;
  formName: string | null;
  email: string | null;
  name: string | null;
  submittedAt: Date | null;
  createdAt: Date;
}

export interface SignedDocRow {
  id: string;
  clientName: string | null;
  name: string | null;
  recipientEmail: string | null;
  completedAt: Date | null;
}

export interface FunnelSummary {
  apps30d: number;
  apps7d: number;
  apps24h: number;
  signedTotal: number;
  byClient: { clientName: string; apps: number }[];
}

export async function listApplications(limit = 100): Promise<ApplicationRow[]> {
  const db = getDb();
  return db
    .select({
      id: applications.id,
      clientName: clients.name,
      formName: applications.formName,
      email: applications.email,
      name: applications.name,
      submittedAt: applications.submittedAt,
      createdAt: applications.createdAt,
    })
    .from(applications)
    .leftJoin(clients, eq(applications.clientId, clients.id))
    .orderBy(
      desc(sql`coalesce(${applications.submittedAt}, ${applications.createdAt})`),
    )
    .limit(limit);
}

export async function listSignedDocs(limit = 50): Promise<SignedDocRow[]> {
  const db = getDb();
  return db
    .select({
      id: signedDocs.id,
      clientName: clients.name,
      name: signedDocs.name,
      recipientEmail: signedDocs.recipientEmail,
      completedAt: signedDocs.completedAt,
    })
    .from(signedDocs)
    .leftJoin(clients, eq(signedDocs.clientId, clients.id))
    .orderBy(desc(signedDocs.completedAt))
    .limit(limit);
}

export async function funnelSummary(): Promise<FunnelSummary> {
  const db = getDb();
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const [[a30], [a7], [a24], [signed], byClient] = await Promise.all([
    db
      .select({ n: count() })
      .from(applications)
      .where(gte(applications.submittedAt, daysAgo(30))),
    db
      .select({ n: count() })
      .from(applications)
      .where(gte(applications.submittedAt, daysAgo(7))),
    db
      .select({ n: count() })
      .from(applications)
      .where(gte(applications.submittedAt, daysAgo(1))),
    db.select({ n: count() }).from(signedDocs),
    db
      .select({ clientName: clients.name, apps: count() })
      .from(applications)
      .innerJoin(clients, eq(applications.clientId, clients.id))
      .groupBy(clients.name)
      .orderBy(desc(count())),
  ]);
  return {
    apps30d: a30?.n ?? 0,
    apps7d: a7?.n ?? 0,
    apps24h: a24?.n ?? 0,
    signedTotal: signed?.n ?? 0,
    byClient: byClient.map((c) => ({ clientName: c.clientName, apps: c.apps })),
  };
}
