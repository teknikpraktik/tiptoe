// Startsida → kartsida med spelarens position (steg 1).
import { setup, START } from "./lib.mjs";

const OUT = process.env.E2E_OUT ?? "e2e/out/start";
const { base, ctx, page, check, done } = await setup({ out: OUT });
try {
  await page.goto(base + "/");
  await page.getByTestId("home-start").waitFor({ timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="home-start"]')?.hasAttribute("disabled"), null, { timeout: 10000 });
  check("startsidan visar Starta promenad", (await page.getByTestId("home-start").innerText()).includes("Starta promenad"));
  check("uppmaning att installera före första promenaden", await page.getByTestId("install").isVisible());
  await page.screenshot({ path: `${OUT}/01-start.png` });
  await page.getByTestId("home-start").click();
  // Webbläsarläge (inte installerad): varningen visas, spela ändå.
  await page.getByTestId("play-anyway").click({ timeout: 5000 });
  await page.waitForURL("**/walk/");
  await page.waitForSelector('[data-testid="map"][data-loaded="true"]', { timeout: 20000 });
  check("kartan laddas", true);
  for (let i = 0; i < 3; i++) { await ctx.setGeolocation(START); await page.waitForTimeout(400); }
  await page.waitForSelector('[data-testid="player"]', { timeout: 5000 });
  check("spelarens markör visas", true);
  const status = await page.getByTestId("status").innerText();
  check("topraden är ren: ingen GPS-, tempo- eller ljudruta när GPS:en är bra", !/GPS|Stilla|Ljud/.test(status), status);
  const attrib = await page.locator(".attrib").innerText();
  check("attribution visas alltid", attrib.includes("OpenStreetMap") && attrib.includes("OpenFreeMap"));
  const [ab, mb] = await Promise.all([page.locator(".attrib").boundingBox(), page.getByTestId("map").boundingBox()]);
  check("attributionen ligger under kartan, inte över den", !!ab && !!mb && ab.y >= mb.y + mb.height - 1, JSON.stringify({ ab, mb }));
  check("kompassknappen (följ mig) finns och är på", (await page.getByTestId("follow").getAttribute("aria-pressed")) === "true");
  await page.screenshot({ path: `${OUT}/02-walk.png` });
} catch (e) {
  check("oväntat fel", false, String(e));
} finally {
  await done();
}
