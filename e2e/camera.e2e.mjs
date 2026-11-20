// Kameratestet (/field/camera, från spik 1) i headless Chromium: fejkad kamera (--use-fake-device-for-media-stream) och syntetiska orienteringshändelser.
// Bevisar kedjan överlägg → förankring → sammanslagning → IndexedDB. Ersätter INTE testet på riktig iPhone (se docs/SPIKE-1-KAMERA.md).
import { setup } from "./lib.mjs";

const OUT = process.env.E2E_OUT ?? "e2e/out/camera";
const { base, page, check, done } = await setup({ out: OUT });

/** Telefonen upprätt med kameran mot `yaw` (kompass), gyrot relativt med förskjutningen `gyroOff`. */
const orient = (yaw, gyroOff = 40) => page.evaluate(([yaw, off]) => {
  // alpha räknas moturs: kurs = 360 − alpha för upprätt telefon (se src/sensors/orientation.ts).
  const a = (v) => ((360 - v) % 360 + 360) % 360;
  window.dispatchEvent(new DeviceOrientationEvent("deviceorientationabsolute", { alpha: a(yaw), beta: 90, gamma: 0, absolute: true }));
  window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: a(yaw - off), beta: 90, gamma: 0, absolute: false }));
}, [yaw, gyroOff]);
const pump = async (yaw, ms = 600) => { for (let t = 0; t < ms; t += 50) { await orient(yaw); await page.waitForTimeout(50); } };
const animalX = () => page.evaluate(() => { const el = document.querySelector('[data-testid="cam-animal"]'); if (!el || el.style.display === "none") return null; const r = el.getBoundingClientRect(); return (r.left + r.right) / 2; });

try {
  await page.goto(base + "/field/camera/");
  await page.getByTestId("open-camera").waitFor();
  // Kompassen läses när vyn öppnas: skicka händelser medan knappen trycks.
  const feeding = (async () => { for (let i = 0; i < 30; i++) { await orient(120); await page.waitForTimeout(50); } })();
  await page.getByTestId("open-camera").click();
  await feeding;
  await page.getByTestId("camera").waitFor({ timeout: 5000 });
  await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 0, null, { timeout: 10000 });
  check("kameravyn öppnas som överlägg utan navigering", page.url().endsWith("/field/camera/"));
  await pump(120, 800);
  const x0 = await animalX();
  check("djuret syns rakt fram", x0 !== null && Math.abs(x0 - 195) < 40, `x=${x0}`);
  await page.screenshot({ path: `${OUT}/01-camera-2d.png` });
  await pump(130, 1500);
  const xr = await animalX();
  check("vrid 10° höger: djuret flyttar sig åt vänster i bilden", xr !== null && xr < x0 - 20, `x=${xr}`);
  await pump(120 + 45, 1500);
  check("vrid 45°: djuret är utanför bild", (await animalX()) === null || (await animalX()) < 0);
  await pump(120 - 45, 1500);
  check("vrid −45°: djuret är utanför bild åt andra hållet", (await animalX()) === null || (await animalX()) > 390);
  await pump(120, 2500);
  const xb = await animalX();
  check("tillbaka: djuret ligger kvar på samma plats (±10 px)", xb !== null && Math.abs(xb - x0) < 10, `x=${xb} (först ${x0})`);
  await page.getByTestId("shutter").click();
  await page.getByTestId("photo").waitFor({ timeout: 10000 });
  check("fotot sammanslås och visas", true);
  const saved = await page.getByText(/Sparade foton: 1/).count();
  check("fotot sparas i IndexedDB", saved === 1);
  const kb = await page.locator(".result .muted").innerText();
  check("fotostorlek rimlig", /\d+×\d+, \d+ kB/.test(kb), kb);
  await page.locator('[data-testid="photo"]').screenshot({ path: `${OUT}/02-photo-2d.png` });

  const m = JSON.parse(await page.getByTestId("metrics").textContent());
  console.log("metrics", JSON.stringify(m));
} catch (e) {
  check("oväntat fel", false, String(e));
} finally {
  await done();
}
