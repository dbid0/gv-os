// restore-templates.mjs [--dry]
// Daniel's final structure: a teamspace is a CONTAINER (not clickable, no page
// of its own). Under "Global Ventures" sit THREE template pages:
//   📋 Client Template   ← carries the dashboard, with its 6 pages nested under it
//   🏗️ Base 44 Template
//   👥 Team Teamspace Template
//
// This undoes the earlier "dissolve into home" step and folds the home page's
// dashboard content INTO the Client Template page, then drops the is_home row so
// no synthetic home is left. Also clears is_home on client teamspaces (their
// "Start Here" becomes an ordinary page in the tree).
// Idempotent. DB target = process.env.DATABASE_URL. Money/ledger untouched.
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });

/** The six pages that belong under Client Template, in order. */
const TEMPLATE_PAGES = [
  "Global Ventures Timeline",
  "Onboarding",
  "Custom GPT's",
  "Coaching Protocol",
  "SOP Database",
  "Resources",
];

try {
  // --- the agency teamspace -------------------------------------------------
  const [home] = await sql`
    select id, title, content from app.workspace_pages
    where client_id is null and is_home = true limit 1`;
  let [tpl] = await sql`
    select id, title from app.workspace_pages
    where client_id is null and is_home = false and parent_id is null
      and title = 'Client Template' limit 1`;

  console.log(`agency home: ${home ? home.title : "(none)"}`);
  console.log(
    `Client Template page: ${tpl ? tpl.id.slice(0, 8) : "(missing — will create)"}`,
  );

  if (!dry) {
    // 1) ensure a Client Template page exists, carrying the dashboard content
    if (!tpl) {
      const [created] = await sql`
        insert into app.workspace_pages (client_id, parent_id, title, icon, content, is_home, sort_order)
        values (null, null, 'Client Template', '📋', ${home?.content ?? null}, false, 0)
        returning id`;
      tpl = { id: created.id, title: "Client Template" };
      console.log(`created Client Template [${tpl.id.slice(0, 8)}]`);
    } else if (home?.content) {
      await sql`update app.workspace_pages set content = ${home.content}, icon = coalesce(icon,'📋') where id = ${tpl.id}`;
      console.log("moved the dashboard content onto Client Template");
    }

    // 2) re-nest the six template pages under it, in order
    for (let i = 0; i < TEMPLATE_PAGES.length; i++) {
      const r = await sql`
        update app.workspace_pages set parent_id = ${tpl.id}, sort_order = ${i}
        where client_id is null and is_home = false and parent_id is null
          and title = ${TEMPLATE_PAGES[i]}`;
      if (r.count) console.log(`  nested "${TEMPLATE_PAGES[i]}" under Client Template`);
    }

    // 3) the three templates sort Client → Base 44 → Team Teamspace
    const order = ["Client Template", "Base 44 Template", "Team Teamspace Template"];
    for (let i = 0; i < order.length; i++) {
      await sql`update app.workspace_pages set sort_order = ${i}
                where client_id is null and parent_id is null and title = ${order[i]}`;
    }

    // 4) drop the synthetic home row — a teamspace has no page of its own
    if (home) {
      await sql`delete from app.workspace_pages where id = ${home.id}`;
      console.log(`deleted synthetic home row "${home.title}"`);
    }

    // 5) client teamspaces: their home becomes an ordinary first page
    const flipped = await sql`update app.workspace_pages set is_home = false
                              where client_id is not null and is_home = true`;
    console.log(`cleared is_home on ${flipped.count} client page(s)`);
  }

  const top = await sql`
    select title, sort_order from app.workspace_pages
    where client_id is null and parent_id is null order by sort_order`;
  console.log("\nagency top level:");
  top.forEach((t) => console.log(`  ${t.sort_order}. ${t.title}`));
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
