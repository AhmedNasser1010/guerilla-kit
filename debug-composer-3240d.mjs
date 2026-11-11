// Final verification: EXACT new poster.ts logic (polling + full
// TRIGGER_TEXT_RE via getByRole) against the failing group. Read-only:
// opens the composer dialog, checks the Post button, then Escape.
import { chromium } from "playwright";
import path from "node:path";

const GROUP_URL = "https://www.facebook.com/groups/324050471991806/";
// Extract the EXACT regexes from src/lib/facebook/poster.ts — no drift.
import { readFileSync } from "node:fs";
const posterSrc = readFileSync("src/lib/facebook/poster.ts", "utf8");
const grab = (name) => {
  const m = posterSrc.match(new RegExp(`${name} =\\s*/(.*?)/(\\w*);`, "s"));
  if (!m) throw new Error(`${name} not found in poster.ts`);
  return new RegExp(m[1], m[2]);
};
const TRIGGER_TEXT_RE = grab("TRIGGER_TEXT_RE");
const POST_BUTTON_RE = grab("POST_BUTTON_RE");
console.log("TRIGGER flags:", TRIGGER_TEXT_RE.flags, "| POST flags:", POST_BUTTON_RE.flags);
console.log("sanity: trigger matches 'Write something...':", TRIGGER_TEXT_RE.test("Write something..."));

const ctx = await chromium.launchPersistentContext(
  path.join(process.cwd(), "browser-data"),
  {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
    ],
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  }
);

const page = await ctx.newPage();
await page.goto(GROUP_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);

// === findComposerTrigger flow (new poster.ts) ===
const candidates = [
  page.getByRole("button", { name: TRIGGER_TEXT_RE }).first(),
  page.locator('[role="button"]').filter({ hasText: TRIGGER_TEXT_RE }).first(),
  page
    .locator(
      'div[contenteditable="true"][role="textbox"]:not([aria-label*="تعليق"]):not([aria-label*="comment" i])'
    )
    .first(),
];

const COMPOSER_WAIT_MS = 45000;
const RELOAD_AFTER_MS = 20000;
const deadline = Date.now() + COMPOSER_WAIT_MS;
const reloadAt = Date.now() + RELOAD_AFTER_MS;
let reloaded = false;
let composerEl = null;
let isRawTextbox = false;
let matchedAt = null;

while (Date.now() < deadline) {
  for (let i = 0; i < candidates.length; i++) {
    const visible = await candidates[i].isVisible().catch(() => false);
    if (!visible) continue;
    composerEl = candidates[i];
    isRawTextbox = i === candidates.length - 1;
    matchedAt = Math.round((Date.now() - deadline + COMPOSER_WAIT_MS) / 1000);
    break;
  }
  if (composerEl) break;
  await page.waitForTimeout(500);
  if (!reloaded && Date.now() >= reloadAt && Date.now() < deadline) {
    reloaded = true;
    console.log("no match yet — reloading (new poster.ts behavior)");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  }
}

if (!composerEl) {
  console.log("FAILED: no trigger found even with polling + reload");
  await ctx.close();
  process.exit(1);
}
console.log(
  `trigger found at ~t+${matchedAt}s, reloaded=${reloaded}, inline=${isRawTextbox}`
);
console.log("  text:", (await composerEl.textContent().catch(() => "?"))?.trim().slice(0, 60));

// === rest of the poster flow (no typing, no posting) ===
const dialog = page.getByRole("dialog").first();
let dialogVisible = false;
if (!isRawTextbox) {
  await composerEl.click({ timeout: 5000 });
  dialogVisible = await dialog
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!dialogVisible) {
    await composerEl.click({ timeout: 5000 }).catch(() => {});
    dialogVisible = await dialog
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  }
}
console.log("dialog visible:", dialogVisible);
if (dialogVisible) {
  await page.waitForTimeout(1500);
  const tb = dialog.locator('div[contenteditable="true"][role="textbox"]').first();
  console.log("textbox visible:", await tb.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false));
  console.log("post btn visible:", await dialog.getByRole("button", { name: POST_BUTTON_RE }).first().waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false));
  await page.keyboard.press("Escape");
  console.log("escaped — nothing typed, nothing published");
}

await page.waitForTimeout(1500);
await ctx.close();
console.log("done (read-only)");
