// linkify-child-bullets.mjs [--dry]
// Some migrated pages list their sub-pages as PLAIN bullets rather than links —
// e.g. Software Logins says "- I Have a Google Workspace" while a child page of
// exactly that name exists, so there is nothing to click. Notion renders those
// as page links.
//
// For every page, turn a bullet whose text exactly names one of that page's
// CHILDREN into a link to it, carrying the child's icon:
//   - I Have a Google Workspace  ->  - 🗂️ [I Have a Google Workspace](?page=<id>)
// Only exact (case-insensitive) title matches are touched, and a bullet that is
// already a link is skipped, so this is idempotent and never guesses.
// Content only — never touches money/ledger tables.
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });

try {
  const rows =
    await sql`select id, parent_id, title, icon, content from app.workspace_pages`;
  const kidsOf = new Map();
  for (const r of rows) {
    if (!r.parent_id) continue;
    const list = kidsOf.get(r.parent_id) ?? [];
    list.push(r);
    kidsOf.set(r.parent_id, list);
  }

  let changedPages = 0;
  let changedLines = 0;
  for (const row of rows) {
    if (!row.content) continue;
    const kids = kidsOf.get(row.id) ?? [];
    if (kids.length === 0) continue;
    const byTitle = new Map(kids.map((k) => [k.title.trim().toLowerCase(), k]));

    let touched = 0;
    const next = row.content
      .split("\n")
      .map((line) => {
        const m = /^(\s*)-\s+(.+?)\s*$/.exec(line);
        if (!m) return line;
        const text = m[2];
        if (text.includes("](")) return line; // already a link
        const kid = byTitle.get(text.trim().toLowerCase());
        if (!kid) return line;
        touched++;
        const icon = kid.icon ? `${kid.icon} ` : "";
        return `${m[1]}- ${icon}[${kid.title}](?page=${kid.id})`;
      })
      .join("\n");

    if (!touched) continue;
    changedPages++;
    changedLines += touched;
    console.log(
      `  ${dry ? "[dry] " : ""}${touched} link(s) → ${JSON.stringify(row.title)}`,
    );
    if (!dry)
      await sql`update app.workspace_pages set content = ${next} where id = ${row.id}`;
  }
  console.log(
    `${changedLines} bullet(s) across ${changedPages} page(s) ${dry ? "would be " : ""}linked`,
  );
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
