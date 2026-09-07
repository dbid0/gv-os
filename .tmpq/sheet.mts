import postgres from "postgres";
const sql = postgres(process.env.DBURL!, { ssl: "require", max: 1 });
const [c] =
  await sql`select slug, tracking_sheet_id from app.clients where slug='the-grid'`;
console.log("sheet id:", c?.tracking_sheet_id ?? "(none linked)");
await sql.end();
