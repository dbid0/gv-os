// fix-callout-icons.mjs [--dry]
// Callout colour is inferred from the LEADING emoji of a quote block. Pages
// migrated by the first pipeline kept Notion's icon inside the text instead of
// in front of it — e.g. "> **Welcome to the team! 👋**" — so the welcome callout
// fell through to neutral grey when Notion has it YELLOW.
//
// Move the icon to the front of the line so it colours correctly:
//   > **Welcome to the team! 👋**   ->   > 👋 **Welcome to the team!**
// Idempotent (a line already starting with the icon is skipped). Content only —
// never touches money/ledger tables.
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });

/** Quote lines whose trailing icon should lead instead. */
const RULES = [
  {
    icon: "👋",
    from: /^> \*\*Welcome to the team! 👋\*\*$/gm,
    to: "> 👋 **Welcome to the team!**",
  },
];

try {
  const rows =
    await sql`select id, title, content from app.workspace_pages where content is not null`;
  let changed = 0;
  for (const row of rows) {
    let next = row.content;
    for (const rule of RULES) next = next.replace(rule.from, rule.to);
    if (next === row.content) continue;
    changed++;
    console.log(`  ${dry ? "[dry] " : ""}fix ${JSON.stringify(row.title)}`);
    if (!dry)
      await sql`update app.workspace_pages set content = ${next} where id = ${row.id}`;
  }
  console.log(`${changed} page(s) ${dry ? "would be" : ""} updated`);
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
