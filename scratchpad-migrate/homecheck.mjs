import postgres from "postgres";
const s = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const rows =
  await s`select coalesce(c.slug,'AGENCY') as slug, w.content from app.workspace_pages w left join app.clients c on c.id=w.client_id where w.is_home=true`;
for (const r of rows) {
  const bg = (r.content.match(/"backgroundColor":"(\w+)"/g) || []).join(",");
  console.log(`${r.slug}: box colors = ${bg || "(none)"}`);
}
await s.end();
