// insert-tree.mjs <clientSlug|agency> <treeJson> [--dry]
// Insert a Notion tree (from notion-api-pull.mjs) into a teamspace, REPLACING
// whatever non-home pages it has. Reusable for every new client.
//
//  1. delete the teamspace's existing pages (a fresh import, not a merge)
//  2. insert parent-before-child, building notionId -> new uuid
//  3. rewrite {{REF:<notionId>}} -> [Title](?page=<uuid>) so the copy is
//     self-contained; a ref to a page outside the tree degrades to its title
//  4. give the ROOT page the same two-column dashboard the Client Template
//     uses, re-pointed at THIS teamspace's pages (the raw Notion columns
//     flatten during conversion, and this is the layout Daniel signed off on)
import { readFileSync } from "node:fs";
import postgres from "postgres";

const [slugArg, treePath] = process.argv.slice(2);
const dry = process.argv.includes("--dry");
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });

try {
  const tree = JSON.parse(readFileSync(treePath, "utf8"));
  const titleById = new Map(tree.map((p) => [p.notionId, p.title.trim()]));

  let clientId = null;
  if (slugArg !== "agency") {
    const [c] = await sql`select id from app.clients where slug = ${slugArg} limit 1`;
    if (!c) throw new Error(`no client with slug "${slugArg}"`);
    clientId = c.id;
  }
  const scope =
    clientId === null ? sql`client_id is null` : sql`client_id = ${clientId}`;

  const existing =
    await sql`select count(*)::int n from app.workspace_pages where ${scope}`;
  console.log(
    `${slugArg}: ${existing[0].n} existing pages -> importing ${tree.length}`,
  );
  if (dry) {
    console.log("[dry] stopping before any write");
    await sql.end();
    process.exit(0);
  }

  await sql`delete from app.workspace_pages where ${scope}`;

  // Parents before children.
  const ordered = [];
  const placed = new Set();
  let rest = tree.slice();
  while (rest.length) {
    const ready = rest.filter((p) => !p.parentNotionId || placed.has(p.parentNotionId));
    if (!ready.length) throw new Error("cycle in tree");
    ready.forEach((p) => {
      ordered.push(p);
      placed.add(p.notionId);
    });
    rest = rest.filter((p) => !placed.has(p.notionId));
  }

  const idMap = new Map();
  for (const p of ordered) {
    const parent = p.parentNotionId ? (idMap.get(p.parentNotionId) ?? null) : null;
    const [row] = await sql`
      insert into app.workspace_pages (client_id, parent_id, title, icon, content, is_home, sort_order)
      values (${clientId}, ${parent}, ${p.title.trim()}, ${p.icon}, ${p.markdown || ""}, false, ${p.order ?? 0})
      returning id`;
    idMap.set(p.notionId, row.id);
  }

  // Resolve the {{REF:}} placeholders.
  let linked = 0;
  for (const p of ordered) {
    if (!p.markdown?.includes("{{REF:")) continue;
    const next = p.markdown.replace(/\{\{REF:([0-9a-f-]{36})\}\}/g, (whole, nid) => {
      const title = titleById.get(nid) ?? "Untitled";
      const uuid = idMap.get(nid);
      return uuid ? `[${title}](?page=${uuid})` : title;
    });
    linked++;
    await sql`update app.workspace_pages set content = ${next} where id = ${idMap.get(p.notionId)}`;
  }

  // The root gets the proven two-column dashboard, re-pointed at these pages.
  const root = ordered.find((p) => !p.parentNotionId);
  const [tpl] = await sql`
    select content from app.workspace_pages
    where client_id is null and title = 'Client Template' and content like '%columnList%' limit 1`;
  let dashboard = 0;
  if (root && tpl?.content) {
    const mine = await sql`select id, title from app.workspace_pages where ${scope}`;
    // Match titles loosely: curly vs straight apostrophes and stray whitespace
    // differ between the template and a client's own Notion ("Custom GPT's" vs
    // "Custom GPT’s") and must not cause a miss.
    const norm = (s) =>
      s
        .replace(/[\u2018\u2019\u02BC]/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const byTitle = new Map(mine.map((r) => [norm(r.title), r.id]));
    // Re-point every ?page= link by the LABEL that follows it. A label with no
    // page in THIS teamspace loses its link entirely rather than keeping the
    // template's id — a client workspace must never link into another one.
    let dropped = 0;
    const next = tpl.content.replace(
      /\{"type":"link","href":"\?page=[0-9a-f-]{36}","content":\[\{"type":"text","text":"([^"]+)","styles":\{\}\}\]\}/g,
      (whole, label) => {
        const id = byTitle.get(norm(label));
        if (id) return whole.replace(/\?page=[0-9a-f-]{36}/, `?page=${id}`);
        dropped++;
        return `{"type":"text","text":${JSON.stringify(label)},"styles":{}}`;
      },
    );
    if (dropped)
      console.log(`  ${dropped} dashboard link(s) had no page here -> plain text`);
    await sql`update app.workspace_pages set content = ${next} where id = ${idMap.get(root.notionId)}`;
    dashboard = 1;
  }

  console.log(
    `  inserted ${idMap.size}, relinked ${linked}, dashboard on root: ${dashboard ? "yes" : "no"}`,
  );
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
