// notion-api-pull.mjs <rootPageId> <outDir>
// Pull a Notion page tree via the REST API (the MCP connector is not always
// available) and emit the same shape convert/insert already expect:
//   <outDir>/tree.json   [{ notionId, parentNotionId, title, icon, markdown, order }]
// Blocks are converted to the app's markdown dialect: callouts -> "> emoji …"
// blockquotes, tables -> GFM, child pages -> {{REF:<id>}} links resolved later.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [rootId, outDir] = process.argv.slice(2);
const TOKEN = process.env.NOTION_TOKEN;
const H = {
  Authorization: `Bearer ${TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Notion allows ~3 requests/second. Every call goes through ONE serialized queue
// with a minimum gap, and 429s are retried honouring Retry-After — firing block
// fetches concurrently gets the whole pull throttled out mid-tree.
const MIN_GAP_MS = 340;
let chain = Promise.resolve();
let lastAt = 0;

function schedule(fn) {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastAt + MIN_GAP_MS - Date.now());
    if (wait) await sleep(wait);
    lastAt = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

async function api(path) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await schedule(() =>
      fetch(`https://api.notion.com/v1${path}`, { headers: H }),
    );
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      await sleep(retryAfter ? retryAfter * 1000 : 800 * (attempt + 1));
      continue;
    }
    if (!res.ok)
      throw new Error(`${res.status} ${path}: ${(await res.text()).slice(0, 160)}`);
    return res.json();
  }
  throw new Error(`giving up on ${path}`);
}

/** Rich text -> markdown, preserving bold/italic/code/strikethrough + links. */
function rt(arr) {
  return (arr || [])
    .map((t) => {
      const raw = t.plain_text ?? "";
      const a = t.annotations || {};
      // Emphasis markers must hug the text: "**bold **" is not valid markdown
      // and renders as literal asterisks, so any padding is hoisted OUTSIDE.
      const lead = raw.match(/^\s*/)[0];
      const tail = raw.match(/\s*$/)[0];
      let s = raw.trim();
      if (s) {
        if (a.code) s = `\`${s}\``;
        if (a.bold) s = `**${s}**`;
        if (a.italic) s = `*${s}*`;
        if (a.strikethrough) s = `~~${s}~~`;
      }
      if (t.href) s = `[${s || raw}](${t.href})`;
      return `${lead}${s}${tail}`;
    })
    .join("");
}

/** An emoji icon, or null for file/external icons we cannot inline. */
function iconOf(obj) {
  const i = obj?.icon;
  return i && i.type === "emoji" ? i.emoji : null;
}

async function childrenOf(id) {
  const out = [];
  let cursor;
  do {
    const q = cursor ? `?start_cursor=${cursor}&page_size=100` : "?page_size=100";
    const d = await api(`/blocks/${id}/children${q}`);
    out.push(...d.results);
    cursor = d.has_more ? d.next_cursor : null;
  } while (cursor);
  return out;
}

/** Convert one block (and its children) to markdown lines. Collects sub-pages. */
async function renderBlock(b, subPages, depth = 0) {
  const pad = "  ".repeat(depth);
  const t = b.type;
  const v = b[t] || {};
  const kids = async () =>
    b.has_children && t !== "child_page"
      ? (
          await Promise.all(
            (await childrenOf(b.id)).map((c) => renderBlock(c, subPages, depth + 1)),
          )
        ).flat()
      : [];

  switch (t) {
    case "child_page":
      subPages.push({ id: b.id, title: v.title || "Untitled" });
      return [`${pad}- {{REF:${b.id}}}`];
    case "heading_1":
      return [`# ${rt(v.rich_text)}`, ...(await kids())];
    case "heading_2":
      return [`## ${rt(v.rich_text)}`, ...(await kids())];
    case "heading_3":
      return [`### ${rt(v.rich_text)}`, ...(await kids())];
    case "paragraph": {
      const s = rt(v.rich_text);
      return [...(s ? [`${pad}${s}`] : []), ...(await kids())];
    }
    case "bulleted_list_item":
      return [`${pad}- ${rt(v.rich_text)}`, ...(await kids())];
    case "numbered_list_item":
      return [`${pad}1. ${rt(v.rich_text)}`, ...(await kids())];
    case "to_do":
      return [
        `${pad}- [${v.checked ? "x" : " "}] ${rt(v.rich_text)}`,
        ...(await kids()),
      ];
    case "toggle":
      return [`${pad}+ ${rt(v.rich_text)}`, ...(await kids())];
    case "quote":
      return [`> ${rt(v.rich_text)}`, ...(await kids())];
    case "callout": {
      // A SMALL callout stays a "> emoji text" card (colorize-callouts tints it —
      // the compliance / warning notes Daniel wants to pop).
      //
      // A callout that WRAPS a whole page is different: BlockNote's markdown
      // import collapses a multi-block blockquote into one quote, so a heading
      // and the text under it merge ("COACH ROADMAPThis is a timeline…"). Those
      // are flattened — the callout's own text stays a card, its children render
      // as ordinary headings / paragraphs / lists.
      const emoji = v.icon?.type === "emoji" ? `${v.icon.emoji} ` : "";
      const own = `${emoji}${rt(v.rich_text)}`.trim();
      const childBlocks = b.has_children ? await childrenOf(b.id) : [];
      const heavy =
        childBlocks.length > 4 ||
        childBlocks.some((c) => c.type.startsWith("heading_") || c.type === "callout");

      if (heavy) {
        const rendered = [];
        for (const c of childBlocks) {
          const lines = await renderBlock(c, subPages, depth);
          if (lines.some((l) => l.trim() !== "")) rendered.push(lines.join("\n"));
        }
        return [...(own ? [`> ${own}`, ""] : []), rendered.join("\n\n")];
      }

      const LIST = new Set(["bulleted_list_item", "numbered_list_item", "to_do"]);
      const out = [`> ${own}`.trimEnd()];
      let prevType = null;
      for (const c of childBlocks) {
        const lines = (await renderBlock(c, subPages, 0))
          .map((l) => l.replace(/^>+\s?/, "").replace(/\s+$/, ""))
          .map((l) => l.replace(/^ +/, (sp) => (sp.length >= 2 ? "  " : "")))
          .filter((l) => l.trim() !== "" && !/^-{3,}$/.test(l.trim()));
        if (lines.length === 0) continue;
        const bothLists = LIST.has(c.type) && prevType && LIST.has(prevType);
        if (prevType !== null && !bothLists) out.push(">");
        out.push(...lines.map((l) => `> ${l}`));
        prevType = c.type;
      }
      return out;
    }
    case "divider":
      return ["---"];
    case "code":
      return ["```" + (v.language || ""), rt(v.rich_text), "```"];
    case "bookmark":
    case "embed":
    case "link_preview":
      return v.url ? [`${pad}[${v.url}](${v.url})`] : [];
    case "image": {
      const url = v.external?.url || v.file?.url;
      return url ? [`${pad}![${rt(v.caption) || "image"}](${url})`] : [];
    }
    case "video":
    case "file":
    case "pdf": {
      const url = v.external?.url || v.file?.url;
      return url ? [`${pad}[${t}](${url})`] : [];
    }
    case "table": {
      const rows = await childrenOf(b.id);
      const cells = rows.map((r) => (r.table_row?.cells || []).map((c) => rt(c)));
      if (cells.length === 0) return [];
      const head = cells[0];
      const sep = head.map(() => "---");
      const body = cells.slice(v.has_column_header ? 1 : 0);
      const line = (c) => `| ${c.join(" | ")} |`;
      return [line(head), line(sep), ...body.map(line)];
    }
    case "column_list":
    case "column":
    case "synced_block":
      return await kids();
    case "child_database":
      return [`${pad}**${v.title || "Database"}** (database)`];
    default:
      return v.rich_text ? [`${pad}${rt(v.rich_text)}`] : [];
  }
}

async function pullPage(id) {
  const page = await api(`/pages/${id}`);
  let title = "Untitled";
  for (const p of Object.values(page.properties || {})) {
    if (p.type === "title") title = rt(p.title) || title;
  }
  const subPages = [];
  const blocks = await childrenOf(id);
  const rendered = await Promise.all(blocks.map((b) => renderBlock(b, subPages)));
  // Join each block's own lines tightly, but separate BLOCKS with a blank line
  // — without it a heading and the paragraph under it merge into one line.
  const markdown = rendered
    .map((lines) => lines.join("\n"))
    .filter((s) => s.trim() !== "")
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { id, title, icon: iconOf(page), markdown, subPages };
}

// BFS the whole tree.
mkdirSync(outDir, { recursive: true });
const tree = [];
const queue = [{ id: rootId, parent: null, order: 0 }];
const seen = new Set();
while (queue.length) {
  const { id, parent, order } = queue.shift();
  if (seen.has(id)) continue;
  seen.add(id);
  const p = await pullPage(id);
  tree.push({
    notionId: id,
    parentNotionId: parent,
    title: p.title,
    icon: p.icon,
    markdown: p.markdown,
    order,
  });
  p.subPages.forEach((c, i) => queue.push({ id: c.id, parent: id, order: i }));
  process.stderr.write(`  pulled ${tree.length}: ${p.title}\n`);
}
writeFileSync(join(outDir, "tree.json"), JSON.stringify(tree, null, 2));
console.log(`${tree.length} pages -> ${join(outDir, "tree.json")}`);
