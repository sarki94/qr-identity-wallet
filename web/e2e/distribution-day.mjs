/**
 * TC-SYS-002: browser system test of a full distribution day across three devices
 * (officer laptop, farmer phone, agent phone). Uses the paste fallback instead of cameras.
 *
 * Run with services + `npm run preview` up:  node e2e/distribution-day.mjs
 * Needs Playwright (`npm i -D playwright` then `npx playwright install chromium`).
 * Screenshots go to e2e/screenshots/ for the user manual.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:4173";
const SHOTS = process.env.SHOTS || new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const phone = { viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 };
const results = [];
const check = (name, cond) => { results.push([name, !!cond]); console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const officer = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
const farmerCtx = await browser.newContext(phone);
const farmer = await farmerCtx.newPage();
const agentCtx = await browser.newContext(phone);
const agent = await agentCtx.newPage();
const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });
const qrText = (page, prefix) => page.locator(`[data-qr^="${prefix}"]`).first().getAttribute("data-qr");
async function paste(page, text) {
  await page.locator("details", { has: page.locator("summary", { hasText: "No camera" }) }).last()
    .evaluate((d) => { d.open = true; });
  await page.locator("#paste-code").last().fill(text);
  await page.getByRole("button", { name: "Use pasted code" }).last().click();
}
async function signIn(page, user, pass) {
  await page.fill("#login-user", user); await page.fill("#login-pass", pass);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// 1. Farmer creates a wallet profile on a (shared) phone.
await farmer.goto(`${BASE}/wallet`);
await farmer.getByRole("button", { name: "+ New profile" }).click();
await farmer.fill("#w-label", "Musa Ibrahim"); await farmer.fill("#w-pin", "123456");
await farmer.getByRole("button", { name: "Create" }).click();
const binding = await qrText(farmer, "QRW1B:");
check("wallet shows a binding code", binding);
await shot(farmer, "01-wallet-binding");

// 2. Officer enrols Musa and issues an L2 credential bound to the wallet.
await officer.goto(`${BASE}/portal`);
await signIn(officer, "officer1", "Officer#2026!");
await officer.fill("#p-nin", "12345678901");
await officer.getByRole("button", { name: "Look up at NIMC" }).click();
await officer.getByText("Issue credential to Musa Ibrahim").waitFor();
await paste(officer, binding);
await officer.getByText("Wallet bound").waitFor();
await officer.getByRole("button", { name: "Sign and issue" }).click();
const credential = await (await officer.waitForSelector('[data-qr^="QRW1:"]')).getAttribute("data-qr");
check("officer issues a signed credential", credential?.startsWith("QRW1:"));
await shot(officer, "02-portal-issued");

// 3. Farmer scans the credential into the wallet.
await farmer.getByRole("button", { name: "Next: add my credential" }).click();
await paste(farmer, credential);
await farmer.getByText("Credential for Musa Ibrahim saved.").waitFor();
check("wallet stores credential bound to its key", true);
await shot(farmer, "03-wallet-saved");

// 4. Agent signs in and syncs while online, then loses the network.
await agent.goto(`${BASE}/verifier`);
await signIn(agent, "agent1", "Agent#2026!");
await agent.getByRole("button", { name: "Sync now" }).click();
await agent.getByText(/^Synced:/).waitFor();
await shot(agent, "04-verifier-synced");
await agentCtx.setOffline(true);
await farmerCtx.setOffline(true);
await agent.getByText("Offline", { exact: true }).waitFor();
check("verifier shows Offline", true);

async function presentAndAnswer() {
  await paste(agent, credential);
  const challenge = await (await agent.waitForSelector('[data-qr^="QRW1C:"]')).getAttribute("data-qr");
  await farmer.goto(`${BASE}/wallet`);
  await farmer.getByRole("button", { name: "Present" }).click();
  await farmer.fill("#w-unlock", "123456");
  await farmer.getByRole("button", { name: "Unlock" }).click();
  await farmer.getByRole("button", { name: /Agent shows a challenge/ }).click();
  await paste(farmer, challenge);
  return (await farmer.waitForSelector('[data-qr^="QRW1R:"]')).getAttribute("data-qr");
}

// 4b. Usage slip: the agent is shown the wallet's binding code by mistake. Helpful message, nothing recorded.
await paste(agent, binding);
check("wrong code type explained, not recorded", await agent.getByText(/binding code/).isVisible()
  && await agent.locator(".status").getByText("0", { exact: true }).isVisible());

// 5. Genuine farmer, fully offline: accepted.
await shot(agent, "05-verifier-offline-scan");
const response = await presentAndAnswer();
await shot(agent, "06-verifier-challenge");
await shot(farmer, "07-wallet-answer");
await paste(agent, response);
await agent.getByText("Is the person in front of you the person shown?").waitFor();
await shot(agent, "08-verifier-face-check");
await agent.getByRole("button", { name: "Yes, same person" }).click();
check("genuine farmer ACCEPTED offline", await agent.getByText("✓ ACCEPTED").isVisible());
await shot(agent, "09-verifier-accepted");

// 6. Screenshot/replay attack: genuine QR + old answer to a previous challenge.
await agent.getByRole("button", { name: "Next farmer" }).click();
await paste(agent, credential);
await agent.waitForSelector('[data-qr^="QRW1C:"]');
await paste(agent, response);
check("replayed answer REJECTED", await agent.getByText("✗ REJECTED").isVisible() && await agent.getByText(/copy or replay/).isVisible());
await shot(agent, "10-verifier-replay-rejected");

// 7. Tampered QR: rejected before any challenge.
await agent.getByRole("button", { name: "Next farmer" }).click();
const i = 40, tampered = credential.slice(0, i) + (credential[i] === "A" ? "B" : "A") + credential.slice(i + 1);
await paste(agent, tampered);
check("tampered QR REJECTED", await agent.getByText("✗ REJECTED").isVisible());
await shot(agent, "11-verifier-tampered-rejected");

// 8. Officer revokes (stolen phone); agent regains signal and syncs; credential now refused.
await officer.locator("#p-reason").selectOption("lost_device");
await officer.getByRole("button", { name: "Revoke" }).click();
await officer.getByText(/^Revoked cred-/).waitFor();
await shot(officer, "12-portal-revoked");
await agentCtx.setOffline(false);
await agent.getByRole("button", { name: "Next farmer" }).click();
await agent.getByRole("button", { name: "Sync now" }).click();
await agent.getByText(/Uploaded 3 record/).waitFor();
check("queued records uploaded on reconnect", true);
await paste(agent, credential);
check("revoked credential REJECTED after sync", await agent.getByText("Credential has been revoked.").isVisible());
await shot(agent, "13-verifier-revoked-rejected");
await agent.getByRole("button", { name: "Next farmer" }).click();
await agent.getByRole("button", { name: "Sync now" }).click();
await agent.getByText(/Uploaded 1 record/).waitFor();

// 9. Auditor sees every attempt in an intact hash chain.
const auditor = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
await auditor.goto(`${BASE}/audit`);
await signIn(auditor, "auditor1", "Auditor#2026!");
await auditor.getByText("✓ Chain intact").waitFor();
check("audit chain intact with 4 records", await auditor.getByText("4 records").isVisible());
await shot(auditor, "14-audit-chain");

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
