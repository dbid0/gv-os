import { chromium } from "playwright";
const b = await chromium.launch({ headless: true, channel: "chrome" });
const pg = await b.newPage({ viewport: { width: 1500, height: 1000 } });
for (const [name, path] of [
  ["call-log", "/sales/call-log"],
  ["quotas", "/sales/quotas"],
  ["apps", "/sales/applications"],
  ["exp", "/accounting/expenses"],
  ["revshare", "/accounting/revshare"],
]) {
  await pg.goto("http://localhost:3000" + path, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await pg.waitForTimeout(1100);
  const t = await pg.evaluate(() =>
    (document.querySelector("main") ?? document.body).innerText.slice(0, 750),
  );
  console.log(`\n##### ${path}\n${t.replace(/\n{2,}/g, "\n")}`);
}
// mobile nav
const m = await b.newPage({ viewport: { width: 390, height: 844 } });
await m.goto("http://localhost:3000/dashboard", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await m.waitForTimeout(1200);
await m.screenshot({ path: "/tmp/shots/mobile-dash.png" });
const mt = await m.evaluate(() => document.body.innerText.slice(0, 400));
console.log(`\n##### MOBILE dashboard\n${mt.replace(/\n{2,}/g, "\n")}`);
await b.close();
