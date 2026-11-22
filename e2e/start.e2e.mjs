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
  // Varumärket SPÅR: logotyp, webbläsartitel, iOS-titel, manifest; ringen över Å klipps inte.
  check("logotypen heter SPÅR", (await page.locator("h1.title").innerText()).trim() === "SPÅR");
  check("webbläsarens titel", (await page.title()) === "SPÅR – Wildlife Adventure", await page.title());
  check("iOS-appens namn (apple-mobile-web-app-title)", (await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute("content")) === "SPÅR");
  check("Open Graph-titel", (await page.locator('meta[property="og:title"]').getAttribute("content")) === "SPÅR – Wildlife Adventure");
  const man = await page.evaluate(async () => (await fetch("/manifest.webmanifest")).json());
  check("manifestet: name och short_name SPÅR", man.name === "SPÅR" && man.short_name === "SPÅR", `${man.name}/${man.short_name}`);
  const clip = await page.evaluate(() => { const h = document.querySelector("h1.title"); const r = document.createRange(); r.selectNodeContents(h); const t = r.getBoundingClientRect(), b = h.getBoundingClientRect(); return { textTop: t.top, boxTop: b.top, overflow: h.scrollHeight - h.clientHeight }; });
  check("logotypen klipps inte (Å får plats)", clip.textTop >= clip.boxTop - 0.5 && clip.overflow <= 1, JSON.stringify(clip));
  check("svensk slogan", (await page.locator(".homehead .sub").innerText()).includes("Upptäck djuren"));
  await page.screenshot({ path: `${OUT}/01-start.png` });
  // "Hur funkar det?": en länk, inte en knapp till bland de stora; sex steg i ett ark.
  await page.getByTestId("howto").click();
  check("Hur funkar det? visar stegen", (await page.locator('[data-testid="howto-steps"] li').count()) === 6);
  await page.screenshot({ path: `${OUT}/01-howto.png` });
  await page.getByText("Nu kör vi", { exact: true }).click();
  check("startsidan har tre stora knappar (ingen fälttestknapp)", (await page.locator(".homenav > .btn").count()) === 3 && (await page.getByText("Fälttest").count()) === 0);
  await page.waitForFunction(() => !document.querySelector('[data-testid="home-start"]')?.hasAttribute("disabled"), null, { timeout: 10000 });
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
