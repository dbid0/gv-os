import postgres from "postgres";
const s = postgres(process.env.PROD_MIGRATION_DATABASE_URL, { max: 1, prepare: false });
const rows =
  await s`select c.slug, count(w.id) filter (where w.is_home=false) as pages from app.clients c left join app.workspace_pages w on w.client_id=c.id where c.status='active' group by c.slug order by pages desc nulls last`;
rows.forEach((r) => console.log(`  ${r.slug}: ${r.pages} pages`));
await s.end();
