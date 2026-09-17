// Vercel's build command (vercel.json "buildCommand"). Plain `npm run build` —
// CI, local — is untouched.
//
// On a PRODUCTION build, pending drizzle migrations are applied first, with the
// production MIGRATION_DATABASE_URL that only Vercel's build holds, then the app
// is built. Order is the safety property: the schema moves before any code that
// reads it goes live, and if a migration fails the build fails, so the previous
// deployment keeps serving. Preview and development builds never migrate.
//
// Every migration is additive by house rule; drizzle applies the pending ones in
// a single transaction. The log shows migration tags and counts only — never a
// connection string.

import { spawnSync } from "node:child_process";

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.MIGRATION_DATABASE_URL && !process.env.DATABASE_URL) {
    console.error(
      "vercel-build: production build has no database URL; refusing to deploy.",
    );
    process.exit(1);
  }
  console.log("vercel-build: production — checking migrations before building");
  run("node", ["scripts/migration-status.mjs"]);
  run("npx", ["tsx", "src/db/migrate.ts"]);
  run("node", ["scripts/migration-status.mjs", "--require-none-pending"]);
  // Seal a credential that was handed to this deploy through Vercel's secret
  // store. A no-op unless CONNECT_SECRET is set, so it costs a deploy nothing
  // the rest of the time. See scripts/connect-from-env.mts for why this exists.
  run("npx", ["tsx", "scripts/connect-from-env.mts"]);
} else {
  console.log(`vercel-build: ${process.env.VERCEL_ENV ?? "local"} — no migrations`);
}

run("npx", ["next", "build"]);
