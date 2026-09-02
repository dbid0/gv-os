// seed-empty-clients.mjs [--dry]
// Give every ACTIVE client with an empty workspace a copy of the agency's
// "Client Template" — the same copy `seedClientWorkspaceFromTemplate` performs
// for a newly created client, applied to the ones that predate it (Racks, Tico).
// Mirrors that logic: parents before children, then internal ?page= links
// re-pointed at the copies so the new teamspace is self-contained.
// Idempotent: a client with ANY page is skipped. Content only.
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });

try {
  const [tpl] = await sql`
    select id, title from app.workspace_pages
    where client_id is null and parent_id is null and title = 'Client Template' limit 1`;
  if (!tpl) {
    console.error("no agency 'Client Template' page — nothing to copy");
    process.exit(1);
  }

  const agency = await sql`select * from app.workspace_pages where client_id is null`;
  const byParent = new Map();
  for (const p of agency) {
    if (!p.parent_id) continue;
    byParent.set(p.parent_id, [...(byParent.get(p.parent_id) ?? []), p]);
  }
  // Walk the template subtree, parents first.
  const subtree = [];
  const stack = [agency.find((p) => p.id === tpl.id)];
  while (stack.length) {
    const n = stack.pop();
    subtree.push(n);
    stack.push(...(byParent.get(n.id) ?? []));
  }
  console.log(`template "${tpl.title}" = ${subtree.length} pages`);

  const clients = await sql`
    select c.id, c.slug, c.name,
           (select count(*) from app.workspace_pages w where w.client_id = c.id)::int as pages
    from app.clients c where c.status = 'active' order by c.name`;

  for (const client of clients) {
    if (client.pages > 0) {
      console.log(`  skip ${client.slug} (${client.pages} pages already)`);
      continue;
    }
    console.log(`  ${dry ? "[dry] " : ""}seeding ${client.slug} …`);
    if (dry) continue;

    const idMap = new Map();
    // Parents before children: subtree is already in that order.
    for (const p of subtree) {
      const parent = p.parent_id ? (idMap.get(p.parent_id) ?? null) : null;
      const [row] = await sql`
        insert into app.workspace_pages (client_id, parent_id, title, icon, content, is_home, sort_order)
        values (${client.id}, ${parent}, ${p.title}, ${p.icon}, ${p.content}, false, ${p.sort_order})
        returning id`;
      idMap.set(p.id, row.id);
    }
    // Re-point internal links at the copies.
    for (const p of subtree) {
      if (!p.content) continue;
      const next = p.content.replace(
        /\?page=([0-9a-fA-F-]{36})/g,
        (whole, id) => `?page=${idMap.get(id) ?? id}`,
      );
      if (next === p.content) continue;
      await sql`update app.workspace_pages set content = ${next} where id = ${idMap.get(p.id)}`;
    }
    console.log(`    copied ${idMap.size} pages into ${client.slug}`);
  }
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
