// patch-abs.mjs <plain|code> — set demo-the-vault "The Offer" to an ABSOLUTE test string
import postgres from "postgres";
const mode = process.argv[2];
const s = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const [r] =
  await s`select w.id from app.workspace_pages w join app.clients c on c.id=w.client_id where c.slug='demo-the-vault' and w.title='The Offer' limit 1`;
const strings = {
  plain:
    "# Hello World\n\nThis is a plain paragraph with **bold** and a list:\n\n- one\n- two\n- three",
  code: "# Hello World\n\nThis is a paragraph with `inline code` in it.\n\n- one\n- two",
};
const c = strings[mode];
if (!c) {
  console.error("mode plain|code");
  process.exit(1);
}
await s`update app.workspace_pages set content=${c} where id=${r.id}`;
console.log(`set The Offer to mode=${mode}, len=${c.length}`);
await s.end();
