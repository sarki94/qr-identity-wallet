/** TC-SYS-003: click through the Guided Demo and check every step lands where it should. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:4173";
const SHOTS = process.env.SHOTS || new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await page.goto(`${BASE}/demo`);
const expect = { 9: "✓ ACCEPTED · An karɓa", 10: "copy or replay", 11: "damaged or altered", 13: "stale list", 15: "revocation list", 16: "Audit chain intact" };
let fails = 0;
for (let n = 1; n <= 16; n++) {
  await page.click("#demo-next");
  await page.waitForFunction((k) => document.querySelector("#demo-next")?.textContent?.includes(`(${k + 1}/16)`) || document.querySelector("#demo-next")?.textContent?.includes("complete"), n, { timeout: 15000 });
  const err = await page.locator(".narr .msg.bad").count();
  const ok = !err && (!expect[n] || (await page.getByText(expect[n]).count()) > 0);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  step ${n}: ${await page.locator(".narr h2").textContent()}`);
  if ([3, 9, 10, 13, 16].includes(n)) await page.screenshot({ path: `${SHOTS}demo-step-${String(n).padStart(2, "0")}.png`, fullPage: true });
}
await browser.close();
console.log(fails ? `${fails} step(s) failed` : "16/16 steps passed");
process.exit(fails ? 1 : 0);
