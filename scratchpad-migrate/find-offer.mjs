import postgres from "postgres";
const s = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const [r] =
  await s`select w.id, w.content from app.workspace_pages w join app.clients c on c.id=w.client_id where c.slug='demo-the-vault' and w.title='The Offer' limit 1`;
console.log("ID=" + r.id);
console.log("---CONTENT---");
console.log(r.content);
await s.end();
