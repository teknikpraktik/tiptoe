// Profiler, språk och hemområde (fas 2.7) i headless Chromium.
import { setup } from "./lib.mjs";

const OUT = process.env.E2E_OUT ?? "e2e/out/settings";
const { base, page, check, done } = await setup({ out: OUT });
try {
  await page.goto(base + "/");
  await page.getByTestId("profile-chip").waitFor({ timeout: 10000 });
  check("startsidan visar aktiv profil", /Profil: Ranger/.test(await page.getByTestId("profile-chip").innerText()));
  await page.getByTestId("home-settings").click();
  await page.waitForURL("**/settings/");
  await page.getByTestId("new-name").fill("Alva");
  await page.getByTestId("create-profile").click();
  await page.waitForFunction(() => /Alva.*Aktiv/s.test(document.querySelector('[data-testid="settings-profiles"]')?.textContent ?? ""), null, { timeout: 5000 });
  check("ny barnprofil skapas och blir aktiv", true);
  const home = await page.getByTestId("settings-home").innerText();
  check("barnprofilen får hemområde 1 km", await page.locator('[data-testid="home-1000"].on').count() === 1, home.split("\n")[0]);
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
} catch (e) {
  check("oväntat fel", false, String(e));
} finally {
  await done();
}
