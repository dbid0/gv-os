// insert.mjs <clientDir> <slug> [--dry]
// Inserts a converted teamspace tree (tree.json) into app.workspace_pages for
// the client with the given slug. IDEMPOTENT: deletes that client's existing
// non-home pages first, then re-inserts. Two phases so internal {{REF:id}} links
// resolve to ?page=<uuid> once every row has a uuid.
//
// DB target = process.env.DATABASE_URL (staging via .env.local, or prod via the
// direct migration URL passed in by the caller). Never touches is_home rows or
// any money/ledger table.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const dir = process.argv[2];
const slug = process.argv[3];
const dry = process.argv.includes("--dry");
if (!dir || !slug) {
  console.error("usage: node insert.mjs <clientDir> <slug> [--dry]");
  process.exit(1);
}

const tree = JSON.parse(readFileSync(join(dir, "tree.json"), "utf8"));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const sql = postgres(url, { max: 8, prepare: false });

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

try {
  const [client] =
    await sql`select id, name, slug from app.clients where slug = ${slug} limit 1`;
  if (!client) {
    console.error(`no client with slug "${slug}"`);
    process.exit(1);
  }
  const clientId = client.id;
  console.log(`client: ${client.name} (${slug}) = ${clientId}`);
  console.log(`tree: ${tree.length} pages`);
  if (dry) {
    console.log("[dry] not writing");
    await sql.end();
    process.exit(0);
  }

  // Idempotent wipe. When the tree carries a root page (it becomes the Home),
  // also remove any existing synthetic is_home dashboard so the client ends up
  // with exactly ONE home — its real root page. When --skiproot dropped the root
  // (Racks/Tico), keep the app-seeded is_home and only replace the child pages.
  const hasRoot = tree.some((p) => p.isRoot);
  const del = hasRoot
    ? await sql`delete from app.workspace_pages where client_id = ${clientId}`
    : await sql`delete from app.workspace_pages where client_id = ${clientId} and is_home = false`;
  console.log(`deleted ${del.count} existing pages (hasRoot=${hasRoot})`);

  // Phase 1: insert every page (parent-first) with placeholder body; map notionId -> uuid.
  const idMap = new Map(); // notionId -> new uuid
  const remaining = [...tree];
  let guard = 0;
  while (remaining.length && guard++ < 50) {
    const ready = remaining.filter(
      (p) => p.effectiveParentNotionId === null || idMap.has(p.effectiveParentNotionId),
    );
    if (ready.length === 0) {
      console.error(
        "cycle/orphan detected, aborting",
        remaining.map((r) => r.title),
      );
      process.exit(1);
    }
    for (const batch of chunk(ready, 8)) {
      const rows = await Promise.all(
        batch.map((p) =>
          sql`insert into app.workspace_pages (client_id, parent_id, title, icon, content, is_home, sort_order)
              values (${clientId}, ${p.effectiveParentNotionId ? idMap.get(p.effectiveParentNotionId) : null},
                      ${p.title}, ${p.icon}, ${p.body}, ${!!p.isRoot}, ${p.sortOrder})
              returning id`.then(([r]) => ({ notionId: p.notionId, id: r.id })),
        ),
      );
      rows.forEach((r) => idMap.set(r.notionId, r.id));
    }
    remaining.splice(
      0,
      remaining.length,
      ...remaining.filter((p) => !idMap.has(p.notionId)),
    );
  }
  console.log(`inserted ${idMap.size} pages`);

  // Phase 2: rewrite {{REF:notionId}} -> ?page=<uuid> in each body, update rows.
  let rewrites = 0;
  const updates = tree
    .map((p) => {
      const uuid = idMap.get(p.notionId);
      let body = p.body;
      let changed = false;
      body = body.replace(/\{\{REF:([0-9a-f]{32})\}\}/g, (m, nid) => {
        const target = idMap.get(nid);
        changed = true;
        rewrites++;
        return target ? `?page=${target}` : `https://www.notion.so/${nid}`;
      });
      return changed ? { uuid, body } : null;
    })
    .filter(Boolean);
  for (const batch of chunk(updates, 8)) {
    await Promise.all(
      batch.map(
        (u) =>
          sql`update app.workspace_pages set content = ${u.body} where id = ${u.uuid}`,
      ),
    );
  }
  console.log(`rewrote internal links in ${updates.length} pages (${rewrites} refs)`);

  const [{ n }] =
    await sql`select count(*)::int as n from app.workspace_pages where client_id = ${clientId} and is_home = false`;
  console.log(`final page count for ${slug}: ${n}`);
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
