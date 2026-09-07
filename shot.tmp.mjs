import { chromium } from "playwright";
const b = await chromium.launch({ headless: true, channel: "chrome" });
const pg = await b.newPage({ viewport: { width: 1500, height: 1000 } });
for (const sec of ["sales", "marketing"]) {
  await pg.goto(`http://localhost:3000/w/the-grid/${sec}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await pg.waitForTimeout(1400);
  await pg.screenshot({ path: `/tmp/shots/ws-${sec}.png` });
}
await b.close();
