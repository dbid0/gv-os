// scan.mjs <clientDir> — reads raw/*.nfm, computes the BFS frontier:
// every child <page url> referenced anywhere that has NOT been fetched yet.
// Prints newline-separated 32-hex IDs to fetch next (the frontier), plus a summary.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scan.mjs <clientDir>");
  process.exit(1);
}
const rawDir = join(dir, "raw");

const norm = (s) => s.replace(/-/g, "").toLowerCase().trim();
const files = readdirSync(rawDir).filter((f) => f.endsWith(".nfm"));
const fetched = new Set(files.map((f) => norm(f.replace(/\.nfm$/, ""))));

// Every page-ref URL that appears inside any fetched file.
const refRe = /<page\s+url="https:\/\/app\.notion\.com\/p\/([0-9a-fA-F]{32})"/g;
const childRe = /<sub_page\s+url="[^"]*?([0-9a-fA-F]{32})"/g; // just in case
const refs = new Map(); // id -> title (best effort)
for (const f of files) {
  const txt = readFileSync(join(rawDir, f), "utf8");
  let m;
  const re = new RegExp(refRe.source, "g");
  while ((m = re.exec(txt))) {
    const id = norm(m[1]);
    // grab the label after the tag close
    const after = txt.slice(m.index).match(/<page[^>]*>([^<]*)<\/page>/);
    refs.set(id, after ? after[1].trim() : "");
  }
}
const frontier = [...refs.keys()].filter((id) => !fetched.has(id));
console.error(
  `fetched=${fetched.size} referenced=${refs.size} frontier=${frontier.length}`,
);
for (const id of frontier) console.error(`  TODO ${id}  ${refs.get(id) || ""}`);
// stdout = just the ids, space-separated, dashed form for convenience
console.log(
  frontier
    .map((id) => id.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5"))
    .join(" "),
);
