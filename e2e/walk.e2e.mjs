// Spelloopen i headless Chromium (steg 5): starta promenad, gå en slinga → reservat, smyg fram till ett djur, fotografera, starta om → data
// finns kvar. GPS:en är MOCKAD: fixar matas genom sessionens injektionshake (samma väg som riktig GPS, genom filtret) med en simulerad klocka,
// så att 10 minuters promenad tar några sekunder. Kameran är Chromiums fejkade kamera.
import { destPoint } from "./geo.mjs";
import { setup, START } from "./lib.mjs";

const OUT = process.env.E2E_OUT ?? "e2e/out/walk";
// Webbläsarens egen platsbevakning stängs av: all GPS kommer via injektionen med den simulerade klockan (annars blandas två klockor).
const { base, ctx, page, check, done } = await setup({ out: OUT, init: () => {
  try { localStorage.setItem("tiptoe.debug", "on"); } catch {}
  try { navigator.geolocation.watchPosition = () => 0; navigator.geolocation.clearWatch = () => undefined; } catch {}
} });

// Fast simulerad starttid (dagtid i juni): samma tidsfönster och djur vid varje körning, så att testet är reproducerbart.
const T0 = Date.UTC(2026, 5, 1, 8, 0, 0);
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

  // Kompass upp: telefonen plant med överkanten mot väster (alpha 90) ⇒ kartan vrids till 270°. Knappen växlar till norr upp och tillbaka.
  const compass = (alpha) => page.evaluate((a) => window.dispatchEvent(new DeviceOrientationEvent("deviceorientationabsolute", { alpha: a, beta: 10, gamma: 0, absolute: true })), alpha);
  const mapBearing = () => page.evaluate(() => Number(document.querySelector('[data-testid="map"]')?.dataset.bearing ?? "NaN"));
  const wrapDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  for (let i = 0; i < 30; i++) { await compass(90); await page.waitForTimeout(50); }
  check("kartan vrids efter kompassen (kompass upp)", wrapDiff(await mapBearing(), 270) < 5, `bäring ${await mapBearing()}`);
  const needleDeg = await page.evaluate(() => { const m = /rotate\((-?[\d.]+)deg\)/.exec(document.querySelector(".compassbtn .needle")?.getAttribute("style") ?? ""); return m ? Number(m[1]) : NaN; });
  check("kompassknappens nål pekar mot norr på kartan", wrapDiff(needleDeg, 90) < 5, `${needleDeg}°`);
  // Norr upp finns i menyn (tillsammans med ljudet).
  await page.getByTestId("menu").click();
  await page.getByTestId("orient-north").click();
  check("menyn visar vald kartriktning", (await page.getByTestId("orient-north").getAttribute("aria-checked")) === "true" && (await page.getByTestId("orient-compass").getAttribute("aria-checked")) === "false");
  await page.getByText("Klar", { exact: true }).click();
  await page.waitForTimeout(1200);
  check("norr upp (i menyn) vrider tillbaka kartan", wrapDiff(await mapBearing(), 0) < 3, `bäring ${await mapBearing()}`);
  await page.getByTestId("menu").click();
  await page.getByTestId("orient-compass").click();
  await page.getByText("Klar", { exact: true }).click();
  for (let i = 0; i < 30; i++) { await compass(0); await page.waitForTimeout(30); }

  // En slinga 130 × 130 m (medurs) från START.
  let p = { latitude: START.latitude, longitude: START.longitude };
  await fix(p);
  for (const b of [0, 90, 180, 270]) p = await walkLine(p, b, 130);
  for (let i = 0; i < 12; i++) await fix(p);
  await page.waitForTimeout(500);
  {
    // Spåret där man gått ritas på kartan och slutar vid spelaren.
    const tr = await page.evaluate(() => { const v = window.__tiptoe.getView(); return { n: v.track.length, pos: v.pos }; });
    check("spåret bakom spelaren finns (minst 50 punkter)", tr.n >= 50, `${tr.n} punkter`);
  }
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
    // Tips första gången ett djur syns, och kortet när man trycker på djuret (arten är okänd tills den fotograferats).
    check("tips visas första gången ett djur syns", (await page.getByTestId("hint").count()) > 0 || (await page.evaluate(() => localStorage.getItem("tiptoe.hint.animal"))) === "1");
    await page.locator(`[data-testid="animal"][data-id="${target.id}"]`).click({ force: true });
    const card = await page.getByTestId("animal-card").innerText({ timeout: 3000 }).catch(() => "");
    check("tryck på djuret visar ett kort (okänt djur, avstånd)", /Okänt/.test(card) && /m bort/.test(card), card.replace(/\n/g, " · "));
    check("tryck på djuret stänger inte av följ mig", (await page.getByTestId("follow").getAttribute("aria-pressed")) === "true");
    await page.getByTestId("animal-card").click().catch(() => undefined);
  }
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
  await page.getByTestId("menu").click();
  check("ljud av/på finns i menyn som brytare", await page.getByTestId("sound").isVisible() && (await page.getByTestId("sound").getAttribute("role")) === "switch");
  await page.screenshot({ path: `${OUT}/07-menu.png` });
  await page.getByText("Klar", { exact: true }).click();
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
  // Fältdagboken: arten är funnen, fotot går att öppna i stort format.
  await page.getByTestId("home-fieldbook").click();
  await page.waitForURL("**/fieldbook/");
  await page.waitForFunction(() => /1\/16/.test(document.querySelector('[data-testid="fieldbook-head"]')?.textContent ?? ""), null, { timeout: 5000 }).catch(() => undefined);
  const head = await page.getByTestId("fieldbook-head").innerText({ timeout: 5000 });
  check("fältdagboken räknar arter och visar titel", /1\/16 arter/.test(head) && /Nykomling/.test(head), head.replace(/\n/g, " "));
  const found = page.locator(".fbcell.found");
  check("den fotograferade arten är funnen, resten silhuetter", (await found.count()) === 1 && (await page.locator(".fbcell.missing").count()) === 15);
  await found.first().click();
  await page.locator(".thumb img").first().waitFor({ timeout: 5000 });
  await page.locator(".thumb").first().click();
  await page.locator(".modal .photo").waitFor({ timeout: 5000 });
  check("fotot öppnas i stort format", true);
  await page.screenshot({ path: `${OUT}/06-fieldbook.png` });
  // Fälttestsidan: diagnostik och promenadens logg.
  await page.goto(base + "/field/");
  await page.getByTestId("log").first().waitFor({ timeout: 5000 });
  const logLine = await page.getByTestId("log").first().innerText();
  check("fältloggen finns med möten, foto och reservat", /[1-9]\d* möten/.test(logLine) && /[1-9]\d* foton/.test(logLine) && /[1-9]\d* reservat/.test(logLine), logLine.split("\n")[0]);
  const envText = await page.getByTestId("field-env").innerText();
  check("diagnostiken visar lagring, beständighet och wake lock", /Lagring/.test(envText) && /Beständig lagring/.test(envText) && /Skärmlås/.test(envText));
  await page.screenshot({ path: `${OUT}/05-field.png`, fullPage: true });

  // Export → rensa → import (spec fas 2: återställer en profil med foton exakt).
  const snapshot = () => page.evaluate(async () => {
    const db = await new Promise((ok, fail) => { const r = indexedDB.open("tiptoe"); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
    const all = (store) => new Promise((ok) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => ok(r.result); });
    const keys = (store) => new Promise((ok) => { const r = db.transaction(store).objectStore(store).getAllKeys(); r.onsuccess = () => ok(r.result); });
    const photos = await all("photos");
    const hashes = [];
    for (const p of photos) { const d = await crypto.subtle.digest("SHA-256", await p.blob.arrayBuffer()); hashes.push(Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("")); }
    const out = { photos: hashes.sort(), observations: (await all("observations")).map((o) => `${o.animalId}:${o.species}:${o.stars}:${o.points}`).sort(), reserves: (await all("reserves")).map((r) => `${r.id}:${Math.round(r.areaM2)}`).sort(), walks: (await keys("walks")).length, residents: JSON.stringify(await all("world")).length > 2 };
    db.close();
    return out;
  });
  const beforeExport = await snapshot();
  page.on("dialog", (d) => void d.accept());
  await page.goto(base + "/settings/");
  await page.getByTestId("export").waitFor();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByTestId("export").click()]);
  const zipPath = `${OUT}/export.zip`;
  await dl.saveAs(zipPath);
  check("exporten laddas ner som zip-fil", (await dl.suggestedFilename()).endsWith(".zip"), await dl.suggestedFilename());
  await page.waitForFunction(() => !/aldrig/.test(document.querySelector('[data-testid="last-export"]')?.textContent ?? "aldrig"), null, { timeout: 5000 }).catch(() => undefined);
  check("senaste export visas", !/aldrig/.test(await page.getByTestId("last-export").innerText()));
  // Rensa: hela databasen bort (som att rensa webbläsardata).
  // Från en sida utan appen (samma origin), så att appens omladdning när databasen försvinner inte stör testet.
  await page.goto(base + "/version.json");
  await page.evaluate(() => new Promise((ok) => { const r = indexedDB.deleteDatabase("tiptoe"); r.onsuccess = r.onerror = r.onblocked = () => ok(null); }));
  await page.goto(base + "/");
  await page.getByTestId("stats").waitFor({ timeout: 10000 });
  check("efter rensning är allt borta", /^.*0 poäng · 0 av 16 arter/.test(await page.getByTestId("stats").innerText()), await page.getByTestId("stats").innerText());
  await page.goto(base + "/settings/");
  await page.getByTestId("import-file").setInputFiles(zipPath);
  await page.getByTestId("import-summary").waitFor({ timeout: 10000 });
  check("importen visar innehållet först", /1 foton|1 photos/.test(await page.getByTestId("import-summary").innerText()), await page.getByTestId("import-summary").innerText());
  await page.getByTestId("import-replace").click();
  await page.getByTestId("backup-msg").waitFor({ timeout: 10000 });
  const afterImport = await snapshot();
  check("import återställer foton exakt (SHA-256), observationer, reservat och promenader", JSON.stringify(afterImport) === JSON.stringify(beforeExport), `${afterImport.photos.length} foton, ${afterImport.observations.length} obs, ${afterImport.reserves.length} reservat`);
  await page.goto(base + "/");
  await page.getByTestId("stats").waitFor();
  const statsAfter = await page.getByTestId("stats").innerText();
  check("startsidan visar samma poäng, arter och areal igen", statsAfter === stats, `${statsAfter} (före: ${stats})`);
  void ctx;
} catch (e) {
  check("oväntat fel", false, String(e));
} finally {
  await done();
}
