import "server-only";

import { and, desc, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { integrations } from "@/db/schema/app";
import { serverEnv } from "@/env.server";
import { open } from "@/lib/crypto/secretbox";

/**
 * Google Sheets access for the finance-sheet mirror.
 *
 * The OAuth credential (client id/secret + refresh token for
 * daniel@globalventures.app) lives SEALED in the integrations vault — provider
 * `google_sheets`, agency scope. It is decrypted here, server-side only, per
 * request; the plaintext never leaves this module.
 */

/** The GV Master Finance Sheet. The ID is not a secret; the data is. */
export const FINANCE_SHEET_ID = "1wTGqP2UQXsfOgfh6XoQB6dtDrn78zRcZ5lRtvkbJvWE";

const RAW_RANGE = "Raw Data!A2:M200";
const COMPUTED_RANGE = "'💰 New Deals'!A2:Q200";

interface GoogleCredential {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

async function loadCredential(): Promise<GoogleCredential> {
  const key = serverEnv().CREDENTIALS_KEY;
  if (!key) throw new Error("CREDENTIALS_KEY is not set — cannot open the vault.");
  const db = getDb();
  const [row] = await db
    .select({ secretBox: integrations.secretBox })
    .from(integrations)
    .where(
      and(
        eq(integrations.provider, "google_sheets"),
        eq(integrations.status, "connected"),
        isNotNull(integrations.secretBox),
      ),
    )
    .orderBy(desc(integrations.createdAt))
    .limit(1);
  if (!row?.secretBox) {
    throw new Error(
      "No connected google_sheets credential in the vault. Connect one under Settings → Integrations.",
    );
  }
  const parsed: unknown = JSON.parse(open(row.secretBox, key));
  const cred = parsed as Partial<GoogleCredential>;
  if (!cred.client_id || !cred.client_secret || !cred.refresh_token) {
    throw new Error("The sealed google_sheets credential is missing OAuth fields.");
  }
  return cred as GoogleCredential;
}

/**
 * A fresh access token from the sealed agency Google credential. Shared by
 * every Google surface (Sheets mirror, Drive assets); the plaintext
 * credential never leaves this module.
 */
export async function googleAccessToken(): Promise<string> {
  return accessToken(await loadCredential());
}

async function accessToken(cred: GoogleCredential): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      refresh_token: cred.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Google token refresh returned no token.");
  return body.access_token;
}

/**
 * Read one range of ANY sheet the agency credential can open, as strings.
 * Money cells come back unformatted (5000, not "$5,000") and dates as the
 * displayed string — both shapes the row parsers accept. Used by the per-offer
 * new-deal importer.
 */
export async function readSheetValues(
  sheetId: string,
  range: string,
): Promise<string[][]> {
  const token = await googleAccessToken();
  const params = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      sheetId,
    )}/values/${encodeURIComponent(range)}?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Sheets read failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { values?: (string | number)[][] };
  return (body.values ?? []).map((row) =>
    row.map((cell) => (cell == null ? "" : String(cell))),
  );
}

export interface FinanceSheetData {
  rawRows: (string | number)[][];
  computedRows: (string | number)[][];
}

/** Read both finance tabs, read-only, unformatted values. */
export async function fetchFinanceSheet(): Promise<FinanceSheetData> {
  const cred = await loadCredential();
  const token = await accessToken(cred);
  const params = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    // Without this, date cells arrive as spreadsheet serial numbers (46195)
    // instead of the displayed date string the parser expects.
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  params.append("ranges", RAW_RANGE);
  params.append("ranges", COMPUTED_RANGE);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${FINANCE_SHEET_ID}/values:batchGet?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Sheets read failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    valueRanges?: { values?: (string | number)[][] }[];
  };
  return {
    rawRows: body.valueRanges?.[0]?.values ?? [],
    computedRows: body.valueRanges?.[1]?.values ?? [],
  };
}
