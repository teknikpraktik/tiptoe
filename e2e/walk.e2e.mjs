// Spelloopen i headless Chromium (steg 5): starta promenad, gå en slinga → reservat, smyg fram till ett djur, fotografera, starta om → data
// finns kvar. GPS:en är MOCKAD: fixar matas genom sessionens injektionshake (samma väg som riktig GPS, genom filtret) med en simulerad klocka,
// så att 10 minuters promenad tar några sekunder. Kameran är Chromiums fejkade kamera.
import { destPoint } from "./geo.mjs";
import { setup, START } from "./lib.mjs";

const OUT = process.env.E2E_OUT ?? "e2e/out/walk";
const { base, ctx, page, check, done } = await setup({ out: OUT, init: () => { try { localStorage.setItem("tiptoe.debug", "on"); } catch {} } });

const T0 = Date.now();
const clock = () => page.evaluate((t) => { window.__simT = t; window.__tiptoe.useClock(() => window.__simT); }, T0);
/** Ett steg: flytta simulerad tid `ms` framåt och mata en fix. */
const fix = (p, ms = 1000) => page.evaluate(([p, ms]) => {
  window.__simT += ms;
  window.__tiptoe.injectGps({ type: "fix", receivedAtMs: window.__simT, fix: { latitude: p.latitude, longitude: p.longitude, accuracyM: 5, timestampMs: window.__simT, speedMps: null, headingDeg: null } });
}, [p, ms]);
const view = () => page.evaluate(() => { const v = window.__tiptoe.getView(); return { stage: v.stage, reserves: v.reserves.length, area: v.totalAreaM2, animals: v.animals, photoTarget: v.photoTarget, score: v.score.total, track: v.track.length, env: v.env, pos: v.pos }; });
async function walkLine(from, bearing, dist, speed = 1.3) {
  let p = from;
  for (let d = 0; d < dist; d += speed) { p = destPoint(p, speed, bearing); await fix(p); }
  return p;
}

try {
  await page.goto(base + "/");
  await page.waitForFunction(() => !!window.__tiptoe, null, { timeout: 10000 });
  await page.getByTestId("home-start").click();
  // Webbläsarläge (inte installerad): varningen visas, spela ändå.
  await page.getByTestId("play-anyway").click({ timeout: 5000 });
  await page.waitForURL("**/walk/");
  await page.waitForSelector('[data-testid="map"][data-loaded="true"]', { timeout: 20000 });
  check("promenaden startar och kartan visas", (await view()).stage === "walking");
  await clock();

  // En slinga 130 × 130 m (medurs) från START.
  let p = { latitude: START.latitude, longitude: START.longitude };
  await fix(p);
  for (const b of [0, 90, 180, 270]) p = await walkLine(p, b, 130);
  for (let i = 0; i < 12; i++) await fix(p);
  await page.waitForTimeout(500);
  let v = await view();
  check("slingan blir ett reservat", v.reserves === 1, `${(v.area / 10_000).toFixed(2)} ha`);
  check("arealen stämmer (±15 %)", Math.abs(v.area / 16_900 - 1) < 0.15, `${Math.round(v.area)} m²`);
  await page.screenshot({ path: `${OUT}/01-reserve.png` });
  check("terrängen är inläst", v.env === "ok", v.env);

  // Gå tills ett djur dyker upp.
  for (let leg = 0; leg < 30 && !(await view()).animals.length; leg++) p = await walkLine(p, [0, 90, 180, 270][leg % 4], 120);
  v = await view();
  check("ett djur dyker upp på kartan", v.animals.length > 0, v.animals.map((a) => a.species).join(","));
  await page.waitForSelector('[data-testid="animal"]', { timeout: 5000 });
  await page.screenshot({ path: `${OUT}/02-animal.png` });

  // Smyg fram (0,4 m/s) tills kameran blir aktiv; om djuret flyr, prova nästa.
  let target = null;
  for (let tries = 0; tries < 6 && !target; tries++) {
    v = await view();
    const a = v.animals.find((x) => x.state !== "flee" && x.state !== "gone");
    if (!a) { p = await walkLine(p, 90, 150); continue; }
    for (let i = 0; i < 600; i++) {
      v = await view();
      const cur = v.animals.find((x) => x.id === a.id);
      if (!cur || cur.state === "flee" || cur.state === "gone") break;
      if (v.photoTarget?.ready) { target = cur; break; }
      const dLat = cur.lat - p.latitude, dLon = cur.lon - p.longitude;
      const dist = Math.hypot(dLat * 111320, dLon * 111320 * Math.cos((p.latitude * Math.PI) / 180));
      if (dist > 6) { const k = 0.4 / dist; p = { latitude: p.latitude + dLat * k, longitude: p.longitude + dLon * k }; }
      await fix(p);
    }
  }
  check("smyga fram ger aktiv kameraknapp", !!target);
  if (target) {
    await page.waitForSelector('[data-testid="camera-btn"]:not([disabled])', { timeout: 5000 });
    // Telefonen riktas mot djuret (kompass = bäringen).
    const bearing = (Math.atan2((target.lon - p.longitude) * Math.cos((p.latitude * Math.PI) / 180), target.lat - p.latitude) * 180) / Math.PI;
    const aim = () => page.evaluate((yaw) => {
      const a = ((360 - yaw) % 360 + 360) % 360;
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientationabsolute", { alpha: a, beta: 90, gamma: 0, absolute: true }));
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { alpha: a, beta: 90, gamma: 0, absolute: false }));
    }, bearing);
    await page.getByTestId("camera-btn").click({ timeout: 10000 });
    await page.getByTestId("camera").waitFor({ timeout: 5000 });
    await page.waitForFunction(() => document.querySelector("video")?.videoWidth > 0, null, { timeout: 10000 });
    for (let i = 0; i < 60; i++) { await aim(); await fix(p, 100); await page.waitForTimeout(50); }
    check("kameravyn öppnas på samma sida", page.url().endsWith("/walk/"));
    await page.screenshot({ path: `${OUT}/03-camera.png` });
    await page.getByTestId("shutter").click();
    await page.getByTestId("result-ok").waitFor({ timeout: 10000 });
    const res = await page.getByTestId("result").innerText().catch(() => "");
    check("fotot får betyg och poäng", /★/.test(res) && /poäng/.test(res), res.replace(/\n/g, " "));
    await page.screenshot({ path: `${OUT}/04-result.png` });
    await page.getByTestId("result-ok").click();
  }
  const sounds = await page.evaluate(() => (window.__tiptoe.currentLog()?.data.entries ?? []).filter((e) => e.k === "sound").map((e) => e.d.kind));
  check("ljudregin ger ljud (närhet, belöning)", sounds.length > 0 && sounds.includes("chime"), sounds.slice(0, 8).join(","));
  check("ljud av/på finns i statusraden", await page.getByTestId("sound").isVisible());
  const before = await view();

  // Omstart: ladda om sidan. Promenaden är pausad, reservat och poäng finns kvar.
  await page.reload();
  await page.waitForFunction(() => !!window.__tiptoe, null, { timeout: 10000 });
  await page.getByTestId("resume").waitFor({ timeout: 10000 });
  const after = await view();
  check("efter omstart: promenaden är pausad och kan fortsätta", after.stage === "paused");
  check("efter omstart: reservat, spår och poäng finns kvar", after.reserves === before.reserves && after.track === before.track && after.score === before.score, `reservat ${after.reserves}, spår ${after.track}, poäng ${after.score}`);
  await page.getByTestId("resume").click();
  await page.waitForTimeout(300);
  check("promenaden fortsätter", (await view()).stage === "walking");
  await page.getByTestId("end").click();
  await page.getByTestId("end-confirm").click();
  await page.waitForTimeout(300);
  check("promenaden avslutas", (await view()).stage === "idle");
  await page.goto(base + "/");
  const stats = await page.getByTestId("stats").innerText({ timeout: 5000 });
  check("startsidan visar poäng och areal", /poäng/.test(stats) && /ha reservat/.test(stats), stats);
  // Fälttestsidan: diagnostik och promenadens logg.
  await page.goto(base + "/field/");
  await page.getByTestId("log").first().waitFor({ timeout: 5000 });
  const logLine = await page.getByTestId("log").first().innerText();
  check("fältloggen finns med möten, foto och reservat", /[1-9]\d* möten/.test(logLine) && /[1-9]\d* foton/.test(logLine) && /[1-9]\d* reservat/.test(logLine), logLine.split("\n")[0]);
  const envText = await page.getByTestId("field-env").innerText();
  check("diagnostiken visar lagring, beständighet och wake lock", /Lagring/.test(envText) && /Beständig lagring/.test(envText) && /Skärmlås/.test(envText));
  await page.screenshot({ path: `${OUT}/05-field.png`, fullPage: true });
  void ctx;
} catch (e) {
  check("oväntat fel", false, String(e));
} finally {
  await done();
}
