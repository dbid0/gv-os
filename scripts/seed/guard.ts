/**
 * The prod guard — the single most important part of this script.
 *
 * The seed writes FAKE data. It must NEVER reach the production database, whose
 * real money numbers are sacred. Everything here is pure and unit-tested so the
 * guard itself cannot silently rot: given a connection string, it decides
 * "staging, safe" or "abort, write nothing" with no I/O and no ambiguity.
 *
 * How it decides: Supabase pooler connection strings carry the project ref in
 * the username (`postgres.<ref>`) and/or host. We refuse any string containing
 * the PROD ref, and refuse any string that does NOT contain the known STAGING
 * ref — an unknown target is treated as unsafe, not "probably fine".
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Production Supabase project ref. If this appears, we abort — always. */
export const PROD_PROJECT_REF = "ifjcxrkndrharndzvoqk";

/** Staging Supabase project ref. The only ref this script will write to. */
export const STAGING_PROJECT_REF = "jlxrxcpynpdiwmsjyojc";

/** Where the connection strings live, per the task. */
export const SECRETS_PATH = join(homedir(), ".gv-os", "secrets.env");

export class ProdGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProdGuardError";
  }
}

/**
 * Assert a connection string points at STAGING and not PROD.
 *
 * Throws ProdGuardError (loud, unmistakable) on anything that is not provably
 * staging. Returns the url unchanged when it is safe, so callers can write
 * `const url = assertStagingUrl(raw)`.
 */
export function assertStagingUrl(url: string | undefined | null): string {
  if (!url || typeof url !== "string" || url.trim() === "") {
    throw new ProdGuardError(
      "PROD GUARD: no connection string provided — refusing to run.",
    );
  }
  if (url.includes(PROD_PROJECT_REF)) {
    throw new ProdGuardError(
      `PROD GUARD TRIPPED: connection string points at the PRODUCTION project ` +
        `ref (${PROD_PROJECT_REF}). Aborting immediately — nothing was written.`,
    );
  }
  if (!url.includes(STAGING_PROJECT_REF)) {
    throw new ProdGuardError(
      `PROD GUARD: connection string does not contain the known STAGING ref ` +
        `(${STAGING_PROJECT_REF}). Refusing to write to an unrecognised target.`,
    );
  }
  return url;
}

/** Parse a KEY=VALUE env file into a plain object. Comments and blanks ignored. */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** Read ~/.gv-os/secrets.env from disk. */
export function readSecrets(path: string = SECRETS_PATH): Record<string, string> {
  return parseEnvFile(readFileSync(path, "utf8"));
}

/**
 * Resolve the staging connection string to use.
 *
 * Prefers the SESSION pooler (MIGRATION url, port 5432): the reset briefly
 * toggles the transactions append-only trigger (DDL), and DDL through the
 * transaction pooler is unreliable. Falls back to the app url. The result is
 * always run through assertStagingUrl before it is returned.
 */
export function resolveStagingUrl(secrets: Record<string, string>): string {
  const candidate =
    secrets.STAGING_MIGRATION_DATABASE_URL || secrets.STAGING_APP_DATABASE_URL;
  return assertStagingUrl(candidate);
}
