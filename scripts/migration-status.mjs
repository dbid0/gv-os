// Prints which drizzle migrations are applied and which are pending on the
// database in MIGRATION_DATABASE_URL (or DATABASE_URL). Tags and counts only —
// never the connection string, never row data.
//
//   node scripts/migration-status.mjs                        # report
//   node scripts/migration-status.mjs --require-none-pending # exit 1 if any pending
//
// drizzle records each applied migration in drizzle.__drizzle_migrations with
// the journal entry's `when` as created_at, so a journal entry counts as
// applied when a row carries that created_at.

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL (or DATABASE_URL) is not set");
  process.exit(1);
}

const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8"));
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  const [{ exists }] = await sql`
    select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
  const applied = new Set();
  if (exists) {
    const rows = await sql`select created_at from drizzle.__drizzle_migrations`;
    for (const row of rows) applied.add(String(row.created_at));
  }

  const pending = journal.entries.filter((e) => !applied.has(String(e.when)));
  console.log(
    `journal: ${journal.entries.length} migrations · applied: ${journal.entries.length - pending.length} · pending: ${pending.length}`,
  );
  for (const e of pending) console.log(`  pending  ${e.tag}`);

  const extra = applied.size - (journal.entries.length - pending.length);
  if (extra > 0) {
    console.log(
      `note: the database has ${extra} applied migration(s) this ref does not know about (a newer branch was migrated).`,
    );
  }

  if (process.argv.includes("--require-none-pending") && pending.length > 0) {
    console.error("::error::migrations still pending after apply");
    process.exit(1);
  }
} finally {
  await sql.end({ timeout: 5 });
}
