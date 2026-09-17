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
 *   CONNECT_REPLACE       "1" to ROTATE an existing connection's key
 *
 * With CONNECT_SECRET unset this does nothing and exits 0, so it is safe to
 * leave in the build. Idempotent: an offer that already has this provider
 * connected is left exactly as it is, UNLESS CONNECT_REPLACE is set — that is
 * how a key gets rotated when the old one has stopped working. Replacing is
 * opt-in because silently overwriting a working credential, on every deploy,
 * would be a very quiet way to break a live integration.
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
const replace = process.env.CONNECT_REPLACE?.trim() === "1";

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
      // Loud, but NOT fatal. Sealing a key against the wrong offer is worse
      // than not sealing it, so this never guesses — but an optional connect
      // step must not take a production deploy down with it. The available
      // slugs are printed so the mistake is one line away from being fixed.
      const all = await sql<{ slug: string }[]>`
        select slug from app.clients where status = 'active' order by slug
      `;
      console.error(
        `connect-from-env: no active client with slug "${slug}" — skipping. ` +
          `Available: ${all.map((r) => r.slug).join(", ") || "(none)"}`,
      );
      process.exit(0);
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
    if (!replace) {
      console.log("connect-from-env: already connected for that offer, leaving it.");
      process.exit(0);
    }
    // Rotation: the credential changes, the connection does not. Keeping the
    // same row means the offer's sync history and its client scope survive.
    await sql`
      update app.integrations
         set secret_box  = ${seal(secret, credentialsKey)},
             secret_hint = ${secretHint(secret)},
             config      = ${sql.json({ method: "api_key" })},
             status      = 'connected',
             updated_at  = now()
       where id = ${already[0].id}
    `;
    console.log("connect-from-env: existing connection re-keyed.");
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
