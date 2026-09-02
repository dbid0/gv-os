// dedupe-child-links.mjs [--dry]
// `repair-template-bodies.mjs` restored child page-link lists on hub pages that
// had lost them. On pages that ALSO carry the dashboard cards (Client Template,
// Base 44 Template), those same pages are already listed inside the cards — so
// the appended list at the bottom is a duplicate and Daniel wants it gone:
// "those things at the bottom shouldn't be there, it would only be where the
// blue line text is."
//
// Removes the TRAILING run of `- [icon ]<Title>(?page=<id>)` bullets, but ONLY
// when every id in it already appears earlier in the page. A page whose only
// navigation is that list (e.g. Teamspace Template, which has no cards) keeps
// it. Idempotent. Content only — never touches money/ledger tables.
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });

/** A single restored link bullet, e.g. `- 📍 [Timeline](?page=uuid)`. */
const LINK_BULLET = /^- (?:\S+ )?\[[^\]]*\]\(\?page=([0-9a-f-]{36})\)$/;

try {
  const rows =
    await sql`select id, title, content from app.workspace_pages where content is not null`;
  let fixed = 0;
  for (const row of rows) {
    const lines = row.content.split("\n");

    // Walk back over the trailing run of link bullets (and blank lines).
    let end = lines.length;
    while (end > 0 && lines[end - 1].trim() === "") end--;
    let start = end;
    const ids = [];
    while (start > 0) {
      const m = LINK_BULLET.exec(lines[start - 1].trim());
      if (!m) break;
      ids.push(m[1]);
      start--;
    }
    if (ids.length < 2) continue;

    // Only a DUPLICATE if every one of those ids is already linked above it.
    const above = lines.slice(0, start).join("\n");
    if (!ids.every((id) => above.includes(`?page=${id}`))) continue;

    const next = lines.slice(0, start).join("\n").trimEnd() + "\n";
    fixed++;
    console.log(
      `  ${dry ? "[dry] " : ""}-${ids.length} duplicate links → ${JSON.stringify(row.title)}`,
    );
    if (!dry)
      await sql`update app.workspace_pages set content = ${next} where id = ${row.id}`;
  }
  console.log(`${fixed} page(s) ${dry ? "would be " : ""}de-duplicated`);
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
