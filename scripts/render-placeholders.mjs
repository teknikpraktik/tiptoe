// Renderar platshållarutklippen (scripts/placeholders/*.svg) till PNG med transparent bakgrund. Körs för hand vid ändring.
import { readdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
for (const f of readdirSync("scripts/placeholders").filter((f) => f.endsWith(".svg"))) {
  await page.setContent(`<html><body style="margin:0;background:transparent">${readFileSync(`scripts/placeholders/${f}`, "utf8")}</body></html>`);
  await page.locator("svg").screenshot({ path: `public/animals/placeholder/${f.replace(".svg", ".png")}`, omitBackground: true });
}
await browser.close();
