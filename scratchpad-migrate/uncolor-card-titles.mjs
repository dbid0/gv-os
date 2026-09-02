// uncolor-card-titles.mjs [--dry]
// The dashboard seed briefly styled its card headers ("⚡ Dashboard",
// "🎥 Content", "📋 To-Do List") blue. Pages seeded then have that colour BAKED
// into their stored BlockNote JSON, so changing the seed alone does not fix an
// existing page. Daniel wants the card text to read as normal text, so drop the
// blue `textColor` from stored content — the bold + underline stay.
// Idempotent. Content only — never touches money/ledger tables.
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });

try {
  const rows = await sql`
    select id, title, content from app.workspace_pages
    where content like '%"textColor":"blue"%'`;
  console.log(`${rows.length} page(s) carry a blue textColor`);
  let fixed = 0;
  for (const row of rows) {
    // Drop just the colour key from each style object, leaving bold/underline.
    const next = row.content
      .replace(/,"textColor":"blue"/g, "")
      .replace(/"textColor":"blue",/g, "")
      .replace(/"textColor":"blue"/g, "");
    if (next === row.content) continue;
    fixed++;
    console.log(`  ${dry ? "[dry] " : ""}uncolour ${JSON.stringify(row.title)}`);
    if (!dry)
      await sql`update app.workspace_pages set content = ${next} where id = ${row.id}`;
  }
  console.log(`${fixed} page(s) ${dry ? "would be " : ""}updated`);
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
