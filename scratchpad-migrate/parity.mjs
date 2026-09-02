// parity.mjs <clientSlug> <rawDir> — mechanically diff a teamspace's LIVE pages
// against the raw Notion source they were imported from. Reports pages that are
// missing, renamed, re-iconed, or whose body lost a meaningful share of its
// source content (callouts, links, headings, characters).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const [slug, rawDir] = process.argv.slice(2);
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });

/** Pull title / icon / body out of one Notion-flavoured-markdown page dump. */
function parseNfm(txt) {
  const title = (txt.match(/\{"title":"((?:[^"\\]|\\.)*)"\}/) || [, ""])[1]
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
  const iconM = txt.match(/<page[^>]*\sicon="([^"]*)"/);
  const icon = iconM && !iconM[1].startsWith("notion://") ? iconM[1] : null;
  const body = (txt.match(/<content>\n([\s\S]*?)\n<\/content>/) || [, ""])[1];
  return { title, icon, body };
}

const count = (s, re) => (s.match(re) || []).length;

try {
  const rows = await sql`
    select w.title, w.icon, coalesce(w.content,'') content
    from app.workspace_pages w join app.clients c on c.id = w.client_id
    where c.slug = ${slug}`;
  const byTitle = new Map(rows.map((r) => [r.title.trim(), r]));

  const files = readdirSync(join(rawDir, "raw")).filter((f) => f.endsWith(".nfm"));
  const issues = [];
  let ok = 0;

  for (const f of files) {
    const src = parseNfm(readFileSync(join(rawDir, "raw", f), "utf8"));
    const live = byTitle.get(src.title.trim());
    if (!live) {
      issues.push(`MISSING PAGE   "${src.title}"`);
      continue;
    }

    const problems = [];
    if (src.icon && live.icon !== src.icon) {
      problems.push(
        `icon ${JSON.stringify(live.icon)} != source ${JSON.stringify(src.icon)}`,
      );
    }
    // Callouts must survive: each <callout> should leave a quote line.
    const srcCallouts = count(src.body, /<callout/g);
    const liveCallouts = count(live.content, /^>|"type":"quote"/gm);
    if (srcCallouts > 0 && liveCallouts < srcCallouts) {
      problems.push(`callouts ${liveCallouts}/${srcCallouts}`);
    }
    // External links must survive.
    const srcLinks = count(src.body, /\]\(https?:\/\//g);
    const liveLinks = count(live.content, /\]\(https?:\/\/|"href":"https?:\/\//g);
    if (srcLinks > 0 && liveLinks < srcLinks)
      problems.push(`links ${liveLinks}/${srcLinks}`);
    // Headings must survive.
    const srcH = count(src.body, /^#{2,3} /gm);
    const liveH = count(live.content, /^#{1,3} |"type":"heading"/gm);
    if (srcH > 0 && liveH < srcH) problems.push(`headings ${liveH}/${srcH}`);
    // Gross body-size loss (strip tags from source for a fair comparison).
    const srcChars = src.body
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim().length;
    const liveChars = live.content.replace(/\s+/g, " ").trim().length;
    if (srcChars > 200 && liveChars < srcChars * 0.6) {
      problems.push(`body ${liveChars}c vs source ${srcChars}c`);
    }
    if (problems.length)
      issues.push(`${src.title}\n      - ${problems.join("\n      - ")}`);
    else ok++;
  }

  console.log(
    `\n=== ${slug}: ${files.length} source pages, ${rows.length} live pages ===`,
  );
  console.log(`  clean: ${ok}`);
  if (issues.length) {
    console.log(`  issues: ${issues.length}`);
    issues.forEach((i) => console.log("    · " + i));
  } else console.log("  no discrepancies");
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
