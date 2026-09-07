import postgres from "postgres";
const sql = postgres(process.env.DBURL!, { ssl: "require", max: 1 });
const items = await sql`
  select a.title, a.status, a.cadence, c.name as client, c.status as cstatus
  from app.action_items a left join app.clients c on c.id = a.client_id
  order by a.created_at desc limit 40`;
for (const i of items)
  console.log(
    `  [${i.status}] ${String(i.title).slice(0, 70)} · client=${i.client ?? "—"}(${i.cstatus ?? "-"}) · cad=${i.cadence}`,
  );
const n = await sql`
  select n.title, c.name as client, c.status as cstatus
  from app.notifications n left join app.clients c on c.id = n.client_id
  order by n.created_at desc limit 15`;
console.log("--- notifications ---");
for (const i of n)
  console.log(
    `  ${String(i.title).slice(0, 70)} · ${i.client ?? "—"}(${i.cstatus ?? "-"})`,
  );
await sql.end();
