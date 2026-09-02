import postgres from "postgres";
const s = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
for (const slug of ["the-grid", "demo-the-vault"]) {
  const homes =
    await s`select w.title, w.is_home, w.icon from app.workspace_pages w join app.clients c on c.id=w.client_id where c.slug=${slug} and w.is_home=true`;
  const total =
    await s`select count(*)::int n from app.workspace_pages w join app.clients c on c.id=w.client_id where c.slug=${slug}`;
  console.log(
    `${slug}: homes=${homes.length} [${homes.map((h) => h.icon + " " + h.title).join(", ")}]  totalPages=${total[0].n}`,
  );
}
await s.end();
