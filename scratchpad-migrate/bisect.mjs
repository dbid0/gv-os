// bisect.mjs <startLine> <endLine> — set demo-the-vault "The Offer" to lines[start..end] of the PRISTINE tree.json body
import postgres from "postgres";
import { readFileSync } from "node:fs";
const [start, end] = [
  parseInt(process.argv[2] || "0"),
  parseInt(process.argv[3] || "999"),
];
const tree = JSON.parse(
  readFileSync("scratchpad-migrate/pull-clients/the-vault/tree.json", "utf8"),
);
const offer = tree.find((p) => p.title === "The Offer");
const lines = offer.body.split("\n");
const c = lines.slice(start, end).join("\n") || "(empty)";
const s = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const [r] =
  await s`select w.id from app.workspace_pages w join app.clients c on c.id=w.client_id where c.slug='demo-the-vault' and w.title='The Offer' limit 1`;
await s`update app.workspace_pages set content=${c} where id=${r.id}`;
console.log(`set lines ${start}..${end} (${lines.length} total), len=${c.length}`);
console.log("first line:", JSON.stringify(lines[start]));
console.log("last line:", JSON.stringify(lines[Math.min(end, lines.length) - 1]));
await s.end();
