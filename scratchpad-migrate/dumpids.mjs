import postgres from "postgres";
import { writeFileSync } from "node:fs";
const s = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
for (const slug of ["demo-the-vault", "the-grid"]) {
  const rows =
    await s`select w.id, w.title from app.workspace_pages w join app.clients c on c.id=w.client_id where c.slug=${slug} and w.is_home=false order by w.title`;
  writeFileSync(`/tmp/ids-${slug}.json`, JSON.stringify(rows));
  console.log(slug, rows.length, "pages");
}
await s.end();
