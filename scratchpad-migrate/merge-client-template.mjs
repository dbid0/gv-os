// merge-client-template.mjs [--dry]
// Daniel: "the Client Template is supposed to BE the home page."
// So the agency teamspace's "Client Template" page is dissolved INTO the home:
// its children (Timeline, Onboarding, Custom GPT's, Coaching Protocol, SOP
// Database, Resources) are re-parented to top level — where they read as part of
// the home — and the now-redundant "Client Template" row itself is deleted.
// The home page (is_home, the dashboard) is left untouched.
//
// Idempotent: if there is no "Client Template" row, it does nothing.
// DB target = process.env.DATABASE_URL. Never touches money/ledger tables.
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });

try {
  const [tpl] = await sql`
    select id, title from app.workspace_pages
    where client_id is null and is_home = false and title = 'Client Template'
    limit 1`;
  if (!tpl) {
    console.log("no 'Client Template' page — nothing to merge (already done).");
    await sql.end();
    process.exit(0);
  }

  const kids = await sql`
    select id, title, sort_order from app.workspace_pages
    where parent_id = ${tpl.id} order by sort_order, title`;
  const others = await sql`
    select id, title from app.workspace_pages
    where client_id is null and is_home = false and parent_id is null and id <> ${tpl.id}
    order by sort_order, title`;

  console.log(`Client Template [${tpl.id.slice(0, 8)}] → dissolve into home`);
  console.log(`  promoting ${kids.length} children to top level:`);
  kids.forEach((k, i) => console.log(`    ${i}. ${k.title}`));
  console.log(`  keeping ${others.length} other top-level pages after them:`);
  others.forEach((o, i) => console.log(`    ${kids.length + i}. ${o.title}`));
  if (dry) {
    console.log("[dry] not writing");
    await sql.end();
    process.exit(0);
  }

  // 1) promote the template's children to top level, in their existing order
  for (let i = 0; i < kids.length; i++) {
    await sql`update app.workspace_pages
              set parent_id = null, sort_order = ${i}
              where id = ${kids[i].id}`;
  }
  // 2) the remaining template hubs sort after them
  for (let i = 0; i < others.length; i++) {
    await sql`update app.workspace_pages
              set sort_order = ${kids.length + i} where id = ${others[i].id}`;
  }
  // 3) drop the now-empty "Client Template" row
  const del = await sql`delete from app.workspace_pages where id = ${tpl.id}`;
  console.log(`deleted Client Template row (${del.count})`);

  const top = await sql`
    select title, sort_order from app.workspace_pages
    where client_id is null and is_home = false and parent_id is null
    order by sort_order`;
  console.log("\nnew top level:");
  top.forEach((t) => console.log(`  ${t.sort_order}. ${t.title}`));
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
