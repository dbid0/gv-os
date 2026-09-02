import postgres from "postgres";
const s = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const rows =
  await s`select id, parent_id, title, icon, is_home, sort_order from app.workspace_pages where client_id is null order by sort_order, title`;
const byId = new Map(rows.map((r) => [r.id, r]));
const kidsOf = (pid) => rows.filter((r) => r.parent_id === pid);
console.log(
  "HOME:",
  rows
    .filter((r) => r.is_home)
    .map((r) => `${r.icon || ""} ${r.title}`)
    .join(" | ") || "(none)",
);
console.log("\nTOP-LEVEL (non-home):");
for (const r of rows.filter((r) => !r.is_home && !r.parent_id)) {
  console.log(
    `  ${r.icon || "·"} ${r.title}  [${r.id.slice(0, 8)}]  children=${kidsOf(r.id).length}`,
  );
  for (const k of kidsOf(r.id))
    console.log(
      `      └ ${k.icon || "·"} ${k.title} [${k.id.slice(0, 8)}] children=${kidsOf(k.id).length}`,
    );
}
console.log("\ntotal agency pages:", rows.length);
await s.end();
