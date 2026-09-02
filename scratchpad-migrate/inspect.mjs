import postgres from "postgres";
const s = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const rows =
  await s`select id, title, is_home, left(coalesce(content,''),160) as head, length(content) as len from app.workspace_pages where client_id is null order by is_home desc, sort_order asc limit 12`;
for (const r of rows) {
  const c = (r.head || "").trim();
  const fmt =
    c.startsWith("[") || c.startsWith("{") ? "JSON" : c === "" ? "EMPTY" : "MARKDOWN";
  console.log(`[${fmt}] home=${r.is_home} len=${r.len || 0}  "${r.title}"`);
  console.log("     " + JSON.stringify(c.slice(0, 110)));
}
const cnt =
  await s`select c.slug, count(w.id) as n from app.clients c left join app.workspace_pages w on w.client_id = c.id where c.status = 'active' group by c.slug order by c.slug`;
console.log("\n=== pages per active client (current) ===");
cnt.forEach((r) => console.log(`  ${r.slug}: ${r.n}`));
await s.end();
