import postgres from "postgres";
const s = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const rows = await s`
  select w.title, length(w.content) as len, left(w.content, 70) as head
  from app.workspace_pages w join app.clients c on c.id = w.client_id
  where c.slug = 'demo-the-vault' and w.is_home = false
  order by w.title`;
for (const r of rows)
  console.log(
    `len=${String(r.len).padStart(5)}  ${JSON.stringify(r.title)}  ${JSON.stringify((r.head || "").slice(0, 50))}`,
  );
await s.end();
