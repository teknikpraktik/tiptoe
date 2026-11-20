import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { haversineM, type LatLon } from "@/geo/geometry";
import { openDb } from "@/storage/idb";
import { Repo } from "@/storage/repo";
import { WalkSession } from "@/play/session";
import { simEnvironment, simPoint } from "@/sim/env";

/** En promenad i den syntetiska miljön med simulerad klocka och injicerad GPS (samma väg som riktig GPS genom filtret). */
async function setup(dbName: string, t0 = Date.UTC(2026, 5, 1, 8, 0, 0)) {
  const db = await openDb(indexedDB, dbName);
  const repo = new Repo(db);
  let t = t0;
  let n = 0;
  const logs: { event: string; data?: Record<string, unknown> }[] = [];
  const s = new WalkSession({ geo: undefined, repo, loadEnv: async () => simEnvironment(), now: () => t, newId: () => `id${++n}`, onLog: (event, data) => logs.push({ event, data }) });
  const fix = (p: LatLon, acc = 5) => s.injectGps({ type: "fix", receivedAtMs: t, fix: { latitude: p.lat, longitude: p.lon, accuracyM: acc, timestampMs: t, speedMps: null, headingDeg: null } });
  const walkTo = async (from: [number, number], to: [number, number], speed = 1.3) => {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const k = Math.max(1, Math.round(d / speed));
    for (let i = 1; i <= k; i++) { t += 1000; fix(simPoint(from[0] + ((to[0] - from[0]) * i) / k, from[1] + ((to[1] - from[1]) * i) / k)); }
    await new Promise((r) => setTimeout(r, 0));
  };
  return { db, repo, s, fix, walkTo, logs, advance: (ms: number) => { t += ms; }, now: () => t };
}

describe("promenadsessionen", () => {
  it("en slinga runt ett kvarter blir ett reservat; djur dyker upp; allt finns kvar efter omstart", async () => {
    const a = await setup("tiptoe-test-session");
    await a.s.init("sv");
    expect(a.s.getView().stage).toBe("idle");
    await a.s.start();
    // Kvarter i parken: 160 × 160 m, sedan en sträcka för fler möten.
    const loop: [number, number][] = [[-500, 300], [-500, 460], [-340, 460], [-340, 300], [-500, 300]];
    a.fix(simPoint(...loop[0]));
    for (let i = 1; i < loop.length; i++) await a.walkTo(loop[i - 1], loop[i]);
    for (let i = 0; i < 12; i++) { a.advance(1000); a.fix(simPoint(-500, 300)); }
    await new Promise((r) => setTimeout(r, 20));
    const v = a.s.getView();
    expect(v.reserves.length).toBe(1);
    expect(v.totalAreaM2 / 25_600).toBeGreaterThan(0.85);
    expect(v.totalAreaM2 / 25_600).toBeLessThan(1.1);
    expect(v.lastClosure?.ha).toBeGreaterThan(2);
    await a.walkTo([-500, 300], [-500, 900]);
    expect(a.logs.some((l) => l.event === "animal_appear")).toBe(true);
    const track = a.s.getView().track.length;
    a.s.onPageHide();
    await new Promise((r) => setTimeout(r, 20));
    a.db.close();

    // "Omstart": ny session mot samma databas.
    const b = await setup("tiptoe-test-session", a.now());
    await b.s.init("sv");
    const w = b.s.getView();
    expect(w.stage).toBe("paused");
    expect(w.track.length).toBe(track);
    expect(w.reserves.length).toBe(1);
    await b.s.start();
    expect(b.s.getView().stage).toBe("walking");
    await b.s.end();
    expect(b.s.getView().stage).toBe("idle");
    expect((await b.repo.walks(w.profile!.id))[0].endedAt).not.toBeNull();
    b.db.close();
  });

  it("smyg fram till ett djur, stå still och fotografera: betyg, poäng och ny art", async () => {
    const a = await setup("tiptoe-test-photo");
    await a.s.init("sv");
    await a.s.start();
    // Gå tills ett djur dyker upp.
    let p: [number, number] = [-900, -900];
    a.fix(simPoint(...p));
    for (let leg = 0; leg < 20 && !a.s.getView().animals.length; leg++) { const q: [number, number] = [p[0], p[1] + 100]; await a.walkTo(p, q); p = q; }
    const animal = a.s.getView().animals[0];
    expect(animal).toBeDefined();
    // Närma sig långsamt (GPS-fart 0,4 m/s räknas som stilla/smyg utan rörelsesensor) till halva fotoavståndet.
    const target: LatLon = { lat: animal.lat, lon: animal.lon };
    let me = simPoint(...p);
    for (let i = 0; i < 1000; i++) {
      const cur = a.s.getView().animals.find((x) => x.id === animal.id);
      if (!cur || cur.state === "flee") break;
      const d = haversineM(me, cur);
      if (d < 8) break;
      const k = 0.4 / d;
      me = { lat: me.lat + (cur.lat - me.lat) * k, lon: me.lon + (cur.lon - me.lon) * k };
      a.advance(1000);
      a.fix(me);
    }
    for (let i = 0; i < 8; i++) { a.advance(1000); a.fix(me); }
    const v = a.s.getView();
    expect(v.photoTarget?.id).toBe(animal.id);
    expect(v.photoTarget?.ready).toBe(true);
    const res = await a.s.photo(animal.id, { blob: new Blob(["x"]), width: 10, height: 10, placement: { x: 0.5, y: 0.6, heightFrac: 0.2, offAxisDeg: 0, inFrame: true } });
    expect(res?.stars).toBeGreaterThanOrEqual(2);
    expect(res?.points).toBeGreaterThan(0);
    expect(res?.newSpecies).toBe(true);
    // Andra fotot av samma individ: inga nya poäng.
    const again = await a.s.photo(animal.id, { blob: new Blob(["y"]), width: 10, height: 10, placement: { x: 0.5, y: 0.6, heightFrac: 0.2, offAxisDeg: 0, inFrame: true } });
    expect(again?.points).toBe(0);
    expect(a.s.getView().score.total).toBe(res!.points);
    expect((await a.repo.observations(v.profile!.id)).length).toBe(2);
    void target;
    a.db.close();
  });
});
