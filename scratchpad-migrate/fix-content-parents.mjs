// fix-content-parents.mjs [--dry]
// I created Assets / YouTube / Instagram Reels / Instagram Stories / Ads at the
// TOP LEVEL of every teamspace, so they dangle in the sidebar beside the
// templates instead of living under the page whose dashboard links them.
//
//   • linked by some page  -> RE-PARENT under that page (where they belong)
//   • linked by nothing    -> DELETE, but only when the page is still exactly
//     the placeholder I seeded and has no children (never touch real content)
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });
const CONTENT = ["Assets", "YouTube", "Instagram Reels", "Instagram Stories", "Ads"];
const placeholder = (t) =>
  `> ${t} — drop the links, files, and notes for this channel here.`;

try {
  const clients =
    await sql`select id, slug from app.clients where status = 'active' order by slug`;
  for (const space of [{ id: null, slug: "agency" }, ...clients]) {
    const rows =
      space.id === null
        ? await sql`select id, title, parent_id, content from app.workspace_pages where client_id is null`
        : await sql`select id, title, parent_id, content from app.workspace_pages where client_id = ${space.id}`;
    if (rows.length === 0) continue;

    const targets = rows.filter(
      (r) => CONTENT.includes(r.title.trim()) && r.parent_id === null,
    );
    if (targets.length === 0) {
      console.log(`  ${space.slug}: nothing to fix`);
      continue;
    }

    // Which page links each one?
    const linker = new Map();
    for (const r of rows) {
      if (!r.content) continue;
      for (const m of r.content.matchAll(/\?page=([0-9a-f-]{36})/g)) {
        if (targets.some((t) => t.id === m[1])) linker.set(m[1], r);
      }
    }
    const hasChildren = new Set(rows.map((r) => r.parent_id).filter(Boolean));

    let moved = 0,
      removed = 0,
      kept = 0;
    for (const t of targets) {
      const parent = linker.get(t.id);
      if (parent) {
        moved++;
        if (!dry)
          await sql`update app.workspace_pages set parent_id = ${parent.id} where id = ${t.id}`;
        continue;
      }
      const untouched = (t.content ?? "").trim() === placeholder(t.title.trim());
      if (untouched && !hasChildren.has(t.id)) {
        removed++;
        if (!dry) await sql`delete from app.workspace_pages where id = ${t.id}`;
      } else {
        kept++; // real content or has children — leave it alone
        console.log(`      keeping "${t.title}" (edited or has children)`);
      }
    }
    const where = linker.size ? [...linker.values()][0].title : "-";
    console.log(
      `  ${dry ? "[dry] " : ""}${space.slug}: ${moved} moved under "${where}", ${removed} removed, ${kept} kept`,
    );
  }
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
