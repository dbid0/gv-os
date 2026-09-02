// patch-test.mjs <mode> — mutate demo-the-vault "The Offer" content to test a hypothesis
import postgres from "postgres";
const mode = process.argv[2];
const s = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const [r] =
  await s`select w.id, w.content from app.workspace_pages w join app.clients c on c.id=w.client_id where c.slug='demo-the-vault' and w.title='The Offer' limit 1`;
let c = r.content;
if (mode === "nobacktick") c = c.replace(/`/g, "");
else if (mode === "nohash") c = c.replace(/#(bootcamp|niche|ugc)/g, "$1");
else if (mode === "firsthalf") c = c.split("\n").slice(0, 8).join("\n");
else if (mode === "onlycode") c = "## Test\n\n`[LOCK exact price]`\n\nafter code";
else {
  console.error("unknown mode");
  process.exit(1);
}
await s`update app.workspace_pages set content=${c} where id=${r.id}`;
console.log(`patched The Offer (mode=${mode}), new len=${c.length}`);
await s.end();
