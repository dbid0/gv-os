// repair-template-bodies.mjs [--dry]
// Two content repairs on pages migrated by the FIRST pipeline (the agency
// templates). Notion's own page shows both; ours lost them.
//
// 1) DUPLICATE TITLE — the body opens with "# <the page's own title>", so the
//    page renders its name twice. Strip that leading H1 when it matches.
// 2) MISSING CHILD LINKS — Notion lists a hub's sub-pages in the body as
//    clickable page links. The old converter dropped `<page>` refs, leaving the
//    hub with a callout and nothing to click. Re-insert them (icon + link, in
//    sidebar order) right before the "Team Meeting Schedule" heading, or at the
//    end when there is no such heading.
//
// Idempotent: a body already fixed is left alone. Content only.
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const sql = postgres(process.env.DATABASE_URL, { max: 4, prepare: false });

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

try {
  const rows = await sql`
    select id, parent_id, title, icon, content, sort_order
    from app.workspace_pages where content is not null order by sort_order`;
  const kidsOf = new Map();
  for (const r of rows) {
    if (!r.parent_id) continue;
    const list = kidsOf.get(r.parent_id) ?? [];
    list.push(r);
    kidsOf.set(r.parent_id, list);
  }

  let fixedTitle = 0;
  let fixedLinks = 0;
  for (const row of rows) {
    let next = row.content;

    // 1) strip a leading H1 that just repeats the page title
    next = next.replace(new RegExp(`^#\\s+${esc(row.title)}\\s*\\n+`), "");

    // 2) re-insert child page links when the body links to NONE of its children
    const kids = (kidsOf.get(row.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const linksAny = kids.some((k) => next.includes(`?page=${k.id}`));
    if (kids.length >= 3 && !linksAny) {
      const list = kids
        .map((k) => `- ${k.icon ? k.icon + " " : ""}[${k.title}](?page=${k.id})`)
        .join("\n");
      const headingIdx = next.search(/^#{1,3}\s+[^\n]*Team Meeting Schedule/m);
      next =
        headingIdx >= 0
          ? `${next.slice(0, headingIdx)}${list}\n\n${next.slice(headingIdx)}`
          : `${next.trimEnd()}\n\n${list}\n`;
      fixedLinks++;
      console.log(
        `  ${dry ? "[dry] " : ""}+${kids.length} child links → ${JSON.stringify(row.title)}`,
      );
    }

    if (next === row.content) continue;
    if (next.length !== row.content.length && !next.startsWith("#")) fixedTitle++;
    if (!dry)
      await sql`update app.workspace_pages set content = ${next} where id = ${row.id}`;
  }
  console.log(
    `link lists restored: ${fixedLinks}; bodies rewritten (incl. title strip): see above`,
  );
  await sql.end();
} catch (e) {
  console.error("ERROR:", e.message);
  await sql.end();
  process.exit(1);
}
