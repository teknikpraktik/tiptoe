// Gemensamt för e2e-testen (mönstret från Outbreaks e2e/*.mjs). GPS är MOCKAD via Playwrights setGeolocation: detta är ett simulerat test
// i headless Chromium, inte ett fälttest på riktig telefon.
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { serve } from "../scripts/serve-out.mjs";

export const START = { latitude: 59.40731, longitude: 13.46753, accuracy: 6 };
const FIX = path.join(import.meta.dirname, "..", "src", "tests", "fixtures", "mvt");

/**
 * OpenFreeMap ersätts av testfixturer: samma TileJSON-form, två riktiga z14-rutor runt START (Karlstad), tom ruta (204) för resten.
 * Testet blir deterministiskt och belastar inte OpenFreeMap.
 */
export async function mockOpenFreeMap(ctx) {
  await ctx.route("https://tiles.openfreemap.org/**", async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/planet") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ tilejson: "3.0.0", tiles: ["https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14, vector_layers: [] }) });
    const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(u.pathname);
    const f = m && path.join(FIX, `${m[1]}-${m[2]}-${m[3]}.pbf`);
    if (f && existsSync(f)) return route.fulfill({ contentType: "application/x-protobuf", body: readFileSync(f) });
    return route.fulfill({ status: 204, body: "" });
  });
}

export async function setup({ out, geolocation = START, init } = {}) {
  const server = await serve(Number(process.env.PORT ?? 3100));
  const base = process.env.BASE_URL ?? `http://localhost:${server.address().port}`;
  if (out) mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, permissions: ["geolocation", "camera", "accelerometer", "gyroscope", "magnetometer"], geolocation, locale: "sv-SE" });
  await mockOpenFreeMap(ctx);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/tiles\.openfreemap|204|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const results = [];
  const check = (name, ok, info = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? " – " + info : ""}`); };
  const done = async () => {
    check("inga JS-fel", errors.length === 0, errors.slice(0, 3).join(" | "));
    await browser.close();
    server.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`${results.length - failed}/${results.length} passed`);
    if (failed) process.exitCode = 1;
  };
  return { base, browser, ctx, page, check, done, errors };
}
