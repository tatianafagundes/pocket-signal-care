/*
 * Fase 7.6 capture harness. Walks both onboarding paths (eSIM, physical) and the payment states
 * (authorized, declined) against the running dev server, screenshotting each key screen at 390x844.
 * Run with the dev server up on :8080. Not part of the app bundle — a throwaway verification tool.
 *
 *   node scripts/capture-fase7.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:8080";
const OUT = "docs/captures/fase7";
const VIEWPORT = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await sleep(500); // let any step-change focus/animation settle
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("  shot:", name);
}

/** Click a wizard primary button by its visible label (Continue / Place order / See plans / Save address). */
async function clickButton(page, label) {
  await page.getByRole("button", { name: label }).first().click();
}

/** Fill an input by its associated <label> text. */
async function fillByLabel(page, label, value) {
  await page.getByLabel(label).fill(value);
}

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  return { ctx, page };
}

async function selectPlan(page) {
  await page.goto(`${BASE}/onboarding/plan`, { waitUntil: "networkidle" });
  await shot(page, `${page.__tag}-01-plan`);
  // Pick the first plan radio.
  await page.locator('button[role="radio"]').first().click();
  await clickButton(page, "Continue");
}

async function fillAccount(page) {
  await page.waitForURL("**/onboarding/account");
  await fillByLabel(page, "First name", "Mia");
  await fillByLabel(page, "Last name", "Berg");
  await fillByLabel(page, "Email", "mia.berg@example.at");
  // Password fields by name attribute (label text is ambiguous with the show/confirm controls).
  await page.locator('input[name="password"]').fill("Str0ng-Pass-9xQ!");
  await page.locator('input[name="confirm"]').fill("Str0ng-Pass-9xQ!");
  await shot(page, `${page.__tag}-05-account`);
  await clickButton(page, "Continue");
}

async function reserveNumber(page) {
  await page.waitForURL("**/onboarding/number");
  await page.locator('button[role="radio"]').first().click();
  await shot(page, `${page.__tag}-04-number`);
  await clickButton(page, "Reserve this number");
}

async function doAddons(page) {
  await page.waitForURL("**/onboarding/addons");
  // Wait for the add-ons list to resolve so we don't capture the loading skeleton.
  await page
    .getByLabel("Available add-ons")
    .waitFor({ timeout: 10000 })
    .catch(() => {});
  await shot(page, `${page.__tag}-03-addons`);
  // Optional step: the primary button reads "Skip" when nothing is chosen, "Continue" otherwise.
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.count()) await skip.first().click();
  else await clickButton(page, "Continue");
}

async function fillPaymentAndCapture(page, { cardNumber, tag }) {
  await page.waitForURL("**/onboarding/review");
  await shot(page, `${tag}-07-review-empty`);
  await page.locator("#card-number").fill(cardNumber);
  await page.locator("#pay-consent").click();
  await shot(page, `${tag}-08-review-filled`);
  await clickButton(page, "Place order");
}

async function runEsim(browser) {
  const { ctx, page } = await newPage(browser);
  page.__tag = "esim";
  console.log("eSIM path:");
  await selectPlan(page);
  // /sim
  await page.waitForURL("**/onboarding/sim");
  await page.locator("#sim-esim").click();
  await shot(page, "esim-02-sim");
  await clickButton(page, "Continue");
  await doAddons(page);
  await reserveNumber(page);
  await fillAccount(page);
  // eSIM skips delivery -> straight to review
  await fillPaymentAndCapture(page, { cardNumber: "4242 4242 4242 4242", tag: "esim" });
  await page.waitForURL("**/onboarding/success", { timeout: 30000 });
  await sleep(1500); // let the eSIM profile query resolve
  await shot(page, "esim-09-success");
  await ctx.close();
}

async function runPhysical(browser) {
  const { ctx, page } = await newPage(browser);
  page.__tag = "phys";
  console.log("Physical path:");
  await selectPlan(page);
  // /sim
  await page.waitForURL("**/onboarding/sim");
  await page.locator("#sim-physical").click();
  await shot(page, "phys-02-sim");
  await clickButton(page, "Continue");
  await doAddons(page);
  await reserveNumber(page);
  await fillAccount(page);
  // physical -> /delivery
  await page.waitForURL("**/onboarding/delivery");
  await fillByLabel(page, "Street address", "Rennweg 97");
  await fillByLabel(page, "City", "Wien");
  await fillByLabel(page, "State or region", "Wien");
  await fillByLabel(page, "Postal code", "1030");
  await shot(page, "phys-06-delivery");
  await clickButton(page, "Save address");
  await fillPaymentAndCapture(page, { cardNumber: "4242 4242 4242 4242", tag: "phys" });
  await page.waitForURL("**/onboarding/success", { timeout: 30000 });
  await shot(page, "phys-09-success");
  await ctx.close();
}

async function runDecline(browser) {
  const { ctx, page } = await newPage(browser);
  page.__tag = "decl";
  console.log("Declined card path:");
  await selectPlan(page);
  await page.waitForURL("**/onboarding/sim");
  await page.locator("#sim-esim").click();
  await clickButton(page, "Continue");
  await doAddons(page);
  await reserveNumber(page);
  await fillAccount(page);
  await page.waitForURL("**/onboarding/review");
  await page.locator("#card-number").fill("4000 0000 0000 0002");
  await page.locator("#pay-consent").click();
  await clickButton(page, "Place order");
  await sleep(2500); // let authorize run + decline surface at the field
  await shot(page, "decl-10-review-declined");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await runEsim(browser);
    await runPhysical(browser);
    await runDecline(browser);
    console.log("DONE");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("CAPTURE ERROR:", e.message);
  process.exit(1);
});
