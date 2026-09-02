// content-pages.mjs [--dry] — the Home's "🎥 Content" card linked five titles
// (Assets · YouTube · Instagram Reels · Instagram Stories · Ads) at a fixed
// `/marketing` route that DOES NOT EXIST in the app — five dead links to a 404.
// They are ordinary sub-pages in Daniel's Notion, so: create them in every
// teamspace that lacks them, then repair each stored Home so its Content links
// point at the real pages instead of the dead route.
// Idempotent; content only, never touches money/ledger tables.
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });

const CONTENT = [
  { title: "Assets", icon: "🎬" },
  { title: "YouTube", icon: "▶️" },
  { title: "Instagram Reels", icon: "📱" },
  { title: "Instagram Stories", icon: "📸" },
  { title: "Ads", icon: "📢" },
];
const body = (t) => `> ${t} — drop the links, files, and notes for this channel here.`;

try {
  const clients =
    await sql`select id, slug from app.clients where status = 'active' order by slug`;
  const spaces = [{ id: null, slug: "agency" }, ...clients];

  for (const space of spaces) {
    const rows =
      space.id === null
        ? await sql`select id, title, parent_id, is_home, content from app.workspace_pages where client_id is null`
        : await sql`select id, title, parent_id, is_home, content from app.workspace_pages where client_id = ${space.id}`;
    if (rows.length === 0) {
      console.log(`  skip ${space.slug} (empty teamspace)`);
      continue;
    }

    const have = new Map(
      rows.filter((r) => !r.is_home).map((r) => [r.title.trim(), r.id]),
    );
    // Nest under a "Content" parent when one exists, else top-level.
    const parentId = have.get("Content") ?? null;
    let made = 0;
    let order = 900;

    for (const c of CONTENT) {
      if (have.has(c.title)) continue;
      made++;
      if (dry) {
        have.set(c.title, `dry-${c.title}`);
        continue;
      }
      const [row] = await sql`
        insert into app.workspace_pages (client_id, parent_id, title, icon, content, is_home, sort_order)
        values (${space.id}, ${parentId}, ${c.title}, ${c.icon}, ${body(c.title)}, false, ${order++})
        returning id`;
      have.set(c.title, row.id);
    }

    // Repair EVERY page in this teamspace that still carries the dead route.
    // (The dashboard lives in the Client Template page, not a home row.)
    let repaired = 0;
    for (const row of rows) {
      if (!row.content || !row.content.includes('"href":"/marketing"')) continue;
      let next = row.content;
      for (const c of CONTENT) {
        const id = have.get(c.title);
        if (!id || String(id).startsWith("dry-")) continue;
        // Only a link whose LABEL is this title (the Content card rows).
        const re = new RegExp(
          `\\{"type":"link","href":"/marketing","content":\\[\\{"type":"text","text":${JSON.stringify(c.title)}`,
          "g",
        );
        next = next.replace(re, (m) =>
          m.replace('"href":"/marketing"', `"href":"?page=${id}"`),
        );
      }
      if (next !== row.content) {
        repaired++;
        if (!dry)
          await sql`update app.workspace_pages set content = ${next} where id = ${row.id}`;
      }
    }

    console.log(
      `  ${dry ? "[dry] " : ""}${space.slug}: +${made} content page(s), ${repaired} page(s) relinked`,
    );
  }
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
