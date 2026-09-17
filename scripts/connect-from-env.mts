/**
 * Connect ONE integration from environment variables, at deploy time.
 *
 * Why this exists: production's DATABASE_URL and CREDENTIALS_KEY are marked
 * Sensitive in Vercel, so nothing outside production can read them — which is
 * correct, and also means a credential cannot be sealed into the vault from a
 * laptop. The UI is the normal way in. This is the other way: put the secret
 * in Vercel's own secret store, let the next deploy seal it, then delete it.
 *
 * The secret therefore never touches the repo, a chat, or a log line. It lives
 * in the same store as every other production secret and leaves as soon as it
 * has been sealed.
 *
 * Nothing here is provider- or client-specific: it connects whatever it is
 * told to, so it works for the next one too.
 *
 *   CONNECT_PROVIDER      e.g. "kit"            (a value from PROVIDERS)
 *   CONNECT_LABEL         what to call it
 *   CONNECT_CLIENT_SLUG   the offer it belongs to; omit for agency-wide
 *   CONNECT_SECRET        the API key
 *
 * With CONNECT_SECRET unset this does nothing and exits 0, so it is safe to
 * leave in the build. Idempotent: an offer that already has this provider
 * connected is left exactly as it is.
 *
 * It talks to Postgres directly rather than through the app's db module: that
 * module is `server-only` and throws outside a Next render, and the sealing
 * itself is a pure function that takes the key as an argument.
 */

import postgres from "postgres";

import { seal, secretHint } from "@/lib/crypto/secretbox";

const provider = process.env.CONNECT_PROVIDER?.trim();
const secret = process.env.CONNECT_SECRET?.trim();
const label = process.env.CONNECT_LABEL?.trim() || provider;
const slug = process.env.CONNECT_CLIENT_SLUG?.trim();

if (!secret || !provider) {
  console.log("connect-from-env: nothing to connect, skipping.");
  process.exit(0);
}

const url = process.env.DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
const credentialsKey = process.env.CREDENTIALS_KEY;
if (!url) {
  console.error("connect-from-env: no database URL — refusing.");
  process.exit(1);
}
if (!credentialsKey) {
  console.error("connect-from-env: CREDENTIALS_KEY is not set — refusing.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  let clientId: string | null = null;
  if (slug) {
    const rows = await sql<{ id: string; name: string }[]>`
      select id, name from app.clients where slug = ${slug} limit 1
    `;
    if (rows.length === 0) {
      // Fail loudly: sealing a key against the WRONG offer is worse than not
      // sealing it, and quietly falling back to agency-wide would do that.
      console.error(`connect-from-env: no client with slug "${slug}" — refusing.`);
      process.exit(1);
    }
    clientId = rows[0].id;
    console.log(`connect-from-env: ${provider} → ${rows[0].name}`);
  }

  const already = await sql<{ id: string }[]>`
    select id from app.integrations
     where provider = ${provider}
       and status = 'connected'
       and client_id is not distinct from ${clientId}
     limit 1
  `;
  if (already.length > 0) {
    console.log("connect-from-env: already connected for that offer, leaving it.");
    process.exit(0);
  }

  await sql`
    insert into app.integrations
      (provider, label, client_id, secret_box, secret_hint, config, status)
    values (
      ${provider}, ${label!}, ${clientId},
      ${seal(secret, credentialsKey)}, ${secretHint(secret)},
      ${sql.json({ method: "api_key" })}, 'connected'
    )
  `;
  // Never the secret, never the hint — only that it worked.
  console.log("connect-from-env: sealed and stored.");
} finally {
  await sql.end({ timeout: 5 });
}

process.exit(0);
