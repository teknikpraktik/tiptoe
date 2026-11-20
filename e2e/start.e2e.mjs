// Startsida → kartsida med spelarens position (steg 1).
import { setup, START } from "./lib.mjs";

const OUT = process.env.E2E_OUT ?? "e2e/out/start";
const { base, ctx, page, check, done } = await setup({ out: OUT });
try {
  await page.goto(base + "/");
  await page.getByTestId("home-start").waitFor({ timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="home-start"]')?.hasAttribute("disabled"), null, { timeout: 10000 });
  check("startsidan visar Starta promenad", (await page.getByTestId("home-start").innerText()).includes("Starta promenad"));
  await page.screenshot({ path: `${OUT}/01-start.png` });
  await page.getByTestId("home-start").click();
  await page.waitForURL("**/walk/");
  await page.waitForSelector('[data-testid="map"][data-loaded="true"]', { timeout: 20000 });
  check("kartan laddas", true);
  for (let i = 0; i < 3; i++) { await ctx.setGeolocation(START); await page.waitForTimeout(400); }
  await page.waitForSelector('[data-testid="player"]', { timeout: 5000 });
  check("spelarens markör visas", true);
  const status = await page.getByTestId("status").innerText();
  check("GPS-status visas", /GPS bra/.test(status), status);
  const attrib = await page.locator(".attrib").innerText();
  check("attribution visas alltid", attrib.includes("OpenStreetMap") && attrib.includes("OpenFreeMap"));
  await page.screenshot({ path: `${OUT}/02-walk.png` });
} catch (e) {
  check("oväntat fel", false, String(e));
} finally {
  await done();
}
