// Profiler och språk (fas 2.7) i headless Chromium.
import { setup } from "./lib.mjs";

const OUT = process.env.E2E_OUT ?? "e2e/out/settings";
const { base, page, check, done } = await setup({ out: OUT });
try {
  await page.goto(base + "/");
  await page.getByTestId("profile-chip").waitFor({ timeout: 10000 });
  check("startsidan visar aktiv profil", /Profil: Ranger/.test(await page.getByTestId("profile-chip").innerText()));
  await page.getByTestId("home-settings").click();
  await page.waitForURL("**/settings/");
  check("en sektion för profilen (inte två)", (await page.locator("section h3", { hasText: /^Profil/ }).count()) === 1);
  await page.getByTestId("add-profile").click();
  await page.getByTestId("new-name").fill("Alva");
  await page.getByTestId("create-profile").click();
  await page.waitForFunction(() => /✓ Alva/.test(document.querySelector('[data-testid="settings-profiles"]')?.textContent ?? ""), null, { timeout: 5000 });
  check("ny barnprofil skapas och blir aktiv", true);
  check("fälttestet finns under inställningar", await page.getByTestId("field-test").isVisible());
  check("hemområdet är borttaget", (await page.getByTestId("settings-home").count()) === 0);
  await page.getByTestId("lang-en").click();
  await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Settings", null, { timeout: 5000 });
  check("språket byts till engelska för profilen", true);
  await page.screenshot({ path: `${OUT}/01-settings-en.png`, fullPage: true });
  await page.goto(base + "/");
  await page.getByTestId("profile-chip").waitFor();
  check("startsidan på engelska med Alva", /Profile: Alva/.test(await page.getByTestId("profile-chip").innerText()));
  check("engelska: produktnamnet är SPÅR och sloganen engelsk", (await page.locator("h1.title").innerText()).trim() === "SPÅR" && (await page.locator(".homehead .sub").innerText()).includes("Make your mark"));
  await page.screenshot({ path: `${OUT}/start-en.png` });
  // Byt tillbaka till Ranger via profilväljaren: språket följer profilen (svenska).
  await page.getByTestId("profile-chip").click();
  await page.getByRole("button", { name: "Ranger", exact: true }).click();
  await page.waitForFunction(() => /Profil: Ranger/.test(document.querySelector('[data-testid="profile-chip"]')?.textContent ?? ""), null, { timeout: 5000 });
  check("profilväljaren byter profil och språket följer med", true);
  await page.reload();
  await page.getByTestId("profile-chip").waitFor();
  await page.waitForFunction(() => /Ranger/.test(document.querySelector('[data-testid="profile-chip"]')?.textContent ?? ""), null, { timeout: 5000 }).catch(() => undefined);
  check("valet överlever omladdning", /Profil: Ranger/.test(await page.getByTestId("profile-chip").innerText()));
  // Byte under en pågående promenad: tidigare var knapparna låsta. Nu pausas promenaden (efter bekräftelse) och bytet går igenom.
  page.on("dialog", (d) => void d.accept());
  await page.getByTestId("home-start").click();
  await page.getByTestId("play-anyway").click({ timeout: 5000 }).catch(() => undefined);
  await page.waitForURL("**/walk/");
  await page.waitForSelector('[data-testid="map"][data-loaded="true"]', { timeout: 20000 });
  await page.goto(base + "/settings/");
  await page.getByTestId("profile-Alva").click();
  await page.waitForFunction(() => /✓ Alva/.test(document.querySelector('[data-testid="settings-profiles"]')?.textContent ?? ""), null, { timeout: 5000 }).catch(() => undefined);
  check("profilbyte mitt i en promenad fungerar", /✓ Alva/.test(await page.getByTestId("settings-profiles").innerText()), (await page.getByTestId("settings-profiles").innerText()).split("\n").slice(0, 3).join(" | "));
  await page.screenshot({ path: `${OUT}/02-settings.png`, fullPage: true });
  // Profilväljaren på startsidan går att använda flera gånger i rad, även när en profil har en pausad promenad (förr bara en gång).
  await page.goto(base + "/");
  await page.getByTestId("profile-chip").waitFor();
  let ok = true;
  for (const name of ["Ranger", "Alva", "Ranger", "Alva"]) {
    await page.getByTestId("profile-chip").click();
    await page.getByRole("button", { name, exact: true }).click({ timeout: 3000 }).catch(() => { ok = false; });
    await page.waitForFunction((n) => (document.querySelector('[data-testid="profile-chip"]')?.textContent ?? "").includes(n), name, { timeout: 3000 }).catch(() => { ok = false; });
  }
  check("profilväljaren byter profil flera gånger i rad", ok);
} catch (e) {
  check("oväntat fel", false, String(e));
} finally {
  await done();
}
