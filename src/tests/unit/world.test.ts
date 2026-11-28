import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { haversineM, type LatLon } from "@/geo/geometry";
import { ENV_LAYERS, makeEnvironment, safeSpot } from "@/geo/environment";
import { decodeFeatures } from "@/geo/mvt";
import { checkPickPoint, type MapFeature } from "@/geo/point-check";
import { BEHAVIOR, WORLD } from "@/engine/config";
import { SPECIES, type SpeciesId } from "@/engine/species";
import { candidates, cellBounds, cellOf, cellsAround, idlePose, windowOf } from "@/engine/world";
import { newEngineState, WorldEngine, type EngineEvent } from "@/engine/engine";
import { simEnvironment, simFeatures, simPoint } from "@/sim/env";

const T0 = Date.UTC(2026, 10, 21, 10, 0, 0);

describe("rutor och tidsfönster", () => {
  it("en punkt ligger i sin ruta, rutorna är ~250 m", () => {
    for (const p of [{ lat: 59.38, lon: 13.5 }, { lat: 55.6, lon: 13.0 }, { lat: 67.85, lon: 20.2 }, { lat: -33.9, lon: 151.2 }]) {
      const b = cellBounds(cellOf(p));
      expect(p.lat >= b.s && p.lat < b.n && p.lon >= b.w && p.lon < b.e).toBe(true);
      expect(haversineM({ lat: b.s, lon: b.w }, { lat: b.n, lon: b.w })).toBeCloseTo(250, 0);
      expect(haversineM({ lat: (b.s + b.n) / 2, lon: b.w }, { lat: (b.s + b.n) / 2, lon: b.e })).toBeGreaterThan(245);
      expect(haversineM({ lat: (b.s + b.n) / 2, lon: b.w }, { lat: (b.s + b.n) / 2, lon: b.e })).toBeLessThan(255);
    }
  });
  it("tidsfönster på 2 h", () => {
    expect(windowOf(T0)).toBe(windowOf(T0 + WORLD.windowMs - 1 - (T0 % WORLD.windowMs)));
    expect(windowOf(T0 + WORLD.windowMs)).toBe(windowOf(T0) + 1);
  });
  it("rutor runt en punkt täcker cirkeln", () => {
    const cs = cellsAround(simPoint(0, 0), 220);
    expect(cs.length).toBeGreaterThanOrEqual(4);
    expect(cs.length).toBeLessThanOrEqual(25);
  });
});

describe("deterministisk värld (syntetisk miljö)", () => {
  const env = simEnvironment();
  it("samma ruta och fönster ger samma individer – även med en separat byggd miljö (två telefoner)", () => {
    const env2 = makeEnvironment(simFeatures());
    const w = windowOf(T0);
    for (const p of [simPoint(-500, -300), simPoint(500, -500), simPoint(-500, 500), simPoint(500, 500)]) {
      const a = candidates(cellOf(p), w, env), b = candidates(cellOf(p), w, env2);
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThan(0);
      for (const c of a) expect(idlePose(c, T0 + 1_234_567, env)).toEqual(idlePose(c, T0 + 1_234_567, env2));
    }
  });
  it("ett annat fönster ger andra individer", () => {
    const c = cellOf(simPoint(-500, -300));
    const a = candidates(c, windowOf(T0), env).map((x) => x.id), b = candidates(c, windowOf(T0) + 1, env).map((x) => x.id);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });
  it("individer och tomgångsrörelser ligger aldrig i vatten, byggnad, nära större väg eller långt från gångbar linje", () => {
    const w = windowOf(T0);
    let n = 0;
    for (let x = -950; x <= 950; x += 250) for (let y = -950; y <= 950; y += 250) {
      for (const c of candidates(cellOf(simPoint(x, y)), w, env)) {
        for (let k = 0; k <= 7200; k += 300) {
          const p = idlePose(c, w * WORLD.windowMs + k * 1000, env).pos;
          expect(safeSpot(env, p, 60), `${c.id} ${k}s`).toBe(true);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(500);
  });
  it("arterna följer miljön: ingen älg i bebyggelse, ekorre/räv finns där", () => {
    const w = windowOf(T0);
    const urban: string[] = [], forest: string[] = [];
    for (let k = 0; k < 6; k++) for (let x = 50; x < 1000; x += 250) for (let y = 50; y < 1000; y += 250) {
      urban.push(...candidates(cellOf(simPoint(x, y)), w + k, env).filter((c) => env.habitat(c.home) === "urban").map((c) => c.species));
      forest.push(...candidates(cellOf(simPoint(-x, -y)), w + k, env).filter((c) => env.habitat(c.home) === "forest").map((c) => c.species));
    }
    expect(urban).not.toContain("moose");
    expect(urban.some((s) => s === "squirrel" || s === "red_fox")).toBe(true);
    expect(forest).toContain("moose");
    expect(forest.length).toBeGreaterThan(20);
  });
});

describe("tile-fixturer (riktig OSM-data, Karlstad)", () => {
  const FIX = path.join(import.meta.dirname, "..", "fixtures", "mvt");
  const tiles: [number, number][] = [[8804, 4811], [8805, 4811]];
  const feats = tiles.flatMap(([x, y]) => decodeFeatures(new Uint8Array(readFileSync(path.join(FIX, `14-${x}-${y}.pbf`))), 14, x, y, ENV_LAYERS));
  const env = makeEnvironment(feats);
  // Samma objekt som point-check.ts tar emot från kartan (GeoJSON-form).
  const asMap: MapFeature[] = feats.flatMap((f): MapFeature[] => f.type === 3
    ? (f.polygons ?? []).map((rings) => ({ sourceLayer: f.layer, properties: f.props, geometry: { type: "Polygon", coordinates: rings.map((r) => r.map((p) => [p.lon, p.lat])) } }))
    : (f.lines ?? []).map((l) => ({ sourceLayer: f.layer, properties: f.props, geometry: { type: "LineString", coordinates: l.map((p) => [p.lon, p.lat]) } })));
  const START: LatLon = { lat: 59.40731, lon: 13.46753 };

  it("inga djur på vatten, byggnad, större väg eller järnväg – kontrollerat med point-check mot samma tiles", () => {
    let n = 0;
    for (let k = 0; k < 4; k++) for (const c of cellsAround(START, 900)) for (const cand of candidates(c, windowOf(T0) + k, env)) {
      for (let s = 0; s <= 7200; s += 600) {
        const p = idlePose(cand, cand.window * WORLD.windowMs + s * 1000, env).pos;
        expect(checkPickPoint(asMap, p), `${cand.id}@${s}`).toBeNull();
        n++;
      }
    }
    expect(n).toBeGreaterThan(300);
  });
  it("flyende djur går aldrig in i spärrade ytor", () => {
    const e = new WorldEngine(newEngineState(T0), env);
    const events: EngineEvent[] = [];
    let p = START;
    // Spring fram och tillbaka genom området: djuren dyker upp och flyr.
    for (let i = 0; i < 3600; i++) {
      const t = T0 + i * 1000;
      p = { lat: START.lat + Math.sin(i / 300) * 0.006, lon: START.lon + Math.sin(i / 170) * 0.01 };
      events.push(...e.step({ tMs: t, pos: p, tempo: i % 600 < 300 ? "run" : "walk", posOk: true }));
      for (const a of e.s.active) if (a.state !== "gone") expect(env.blocked(a.pos) || env.hazard(a.pos), `${a.id} ${a.state}`).toBe(false);
    }
    expect(events.filter((x) => x.type === "flee").length).toBeGreaterThanOrEqual(3);
  });
});

describe("motorn: budget, upptäckt och flykt", () => {
  const env = simEnvironment();
  const walk = (e: WorldEngine, from: [number, number], to: [number, number], speed: number, tempo: "still" | "sneak" | "walk" | "run", t0: number, ev: EngineEvent[] = []) => {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const n = Math.max(1, Math.round(d / speed));
    for (let i = 1; i <= n; i++) ev.push(...e.step({ tMs: t0 + i * 1000, pos: simPoint(from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n), tempo, posOk: true }));
    return { t: t0 + n * 1000, ev };
  };
  it("stillastående ger inga nya djur", () => {
    const e = new WorldEngine(newEngineState(T0), env);
    const ev: EngineEvent[] = [];
    for (let i = 0; i < 1800; i++) ev.push(...e.step({ tMs: T0 + i * 1000, pos: simPoint(-480, -320 + (i % 2) * 2), tempo: "still", posOk: true }));
    expect(ev.filter((x) => x.type === "appear").length).toBeLessThanOrEqual(1); // startbudgeten 0,6 räcker inte till ett möte
  });
  it("att gå ger möten, och samma promenad ger samma djur på två telefoner", () => {
    const run = () => {
      const e = new WorldEngine(newEngineState(T0), makeEnvironment(simFeatures()));
      return walk(e, [-960, -960], [-960, 960], 1.3, "walk", T0).ev.filter((x) => x.type === "appear");
    };
    const a = run(), b = run();
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a).toEqual(b);
  });
  it("djuret dyker upp minst 60 m bort och aldrig i en klump", () => {
    const e = new WorldEngine(newEngineState(T0), env);
    const ev: EngineEvent[] = [];
    walk(e, [-960, -40], [960, -40], 1.3, "walk", T0, ev);
    for (const x of ev) if (x.type === "appear") expect(x.distM).toBeGreaterThanOrEqual(60);
  });
  /** Ett djur rakt fram, och spelaren som närmar sig i ett visst tempo till `stopAt` m. */
  const approach = (tempo: "sneak" | "walk" | "run", species: SpeciesId = "lynx", stopAt = 30) => {
    const s = newEngineState(T0);
    const e = new WorldEngine(s, env);
    const home = simPoint(500, -500);
    s.active.push({ id: "test", species, seed: 1, cell: cellOf(home), window: windowOf(T0), n: 0, home, pos: home, headingDeg: 0, state: "graze", alarm: 0, disturbed: true, appearedAtMs: T0 });
    s.budget = -100; // inga andra djur
    let t = T0;
    const speed = tempo === "sneak" ? 0.6 : tempo === "walk" ? 1.3 : 3;
    // En smygande spelare fryser när djuret förvarnar eller tittar (spec: Frys!); en gående bryr sig inte.
    for (let d = 90; d >= stopAt;) {
      t += 1000;
      const freeze = tempo === "sneak" && !!s.active[0].look;
      if (!freeze) d -= speed;
      e.step({ tMs: t, pos: simPoint(500, -500 - d), tempo: freeze ? "still" : tempo, posOk: true, tempoFromMotion: true });
      if (s.active[0].state === "flee" || s.active[0].state === "gone") return { fledAt: d, e, t };
    }
    // Framme: stå still och fotografera.
    const me = simPoint(500, -500 - stopAt);
    t += 1000;
    e.step({ tMs: t, pos: me, tempo: "still", posOk: true });
    return { fledAt: null, e, t, can: e.canPhotograph(s.active[0], me, "still"), canWalking: e.canPhotograph(s.active[0], me, "walk") };
  };
  it("gå rakt mot ett lodjur (sällsynt): det flyr innan fotoavståndet (35 m)", () => {
    const r = approach("walk");
    expect(r.fledAt).not.toBeNull();
    expect(r.fledAt!).toBeGreaterThan(SPECIES.lynx.photoM);
  });
  it("smyg fram till ett lodjur och stå still: fotot går att ta (men inte i gångtempo)", () => {
    const r = approach("sneak");
    expect(r.fledAt).toBeNull();
    expect(r.can).toBe(true);
    expect(r.canWalking).toBe(false);
  });
  it("vanliga djur är lätta (fälttest 2): till ett rådjur räcker det att gå lugnt fram och stanna inom fotoavståndet", () => {
    expect(SPECIES.roe_deer.photoM).toBeGreaterThan(SPECIES.lynx.photoM);
    const r = approach("walk", "roe_deer", 40);
    expect(r.fledAt).toBeNull();
    expect(r.can).toBe(true);
  });
  it("ett djur som springer iväg stannar en kort bit bort med flyktvägen som spår; sista gången försvinner det (ovanligt: 2 flykter)", () => {
    const r = approach("run", "wild_boar", 5);
    expect(r.fledAt).not.toBeNull();
    let t = r.t;
    const me = simPoint(500, -560);
    for (let i = 0; i < 60; i++) { t += 1000; r.e.step({ tMs: t, pos: me, tempo: "still", posOk: true }); }
    const a = r.e.s.active.find((x) => x.id === "test")!;
    expect(a).toBeDefined();
    expect(a.state).not.toBe("gone");
    expect(a.flees).toBe(1);
    const far = haversineM(a.pos, simPoint(500, -500));
    expect(far).toBeGreaterThan(BEHAVIOR.fleeDistM[0] - 5);
    expect(far).toBeLessThan(BEHAVIOR.fleeDistM[1] + 5);
    expect(r.e.trails(me).some((x) => x.id === "test")).toBe(true);
    // Spring rakt mot det igen: nu försvinner det.
    let p = me;
    for (let i = 0; i < 120 && r.e.s.active.find((x) => x.id === "test")?.state !== "gone" && r.e.s.active.some((x) => x.id === "test"); i++) {
      t += 1000;
      const v = r.e.s.active.find((x) => x.id === "test")!;
      if (v.state !== "flee" && haversineM(p, v.pos) > 8) { const k = 2 / haversineM(p, v.pos); p = { lat: p.lat + (v.pos.lat - p.lat) * k, lon: p.lon + (v.pos.lon - p.lon) * k }; }
      r.e.step({ tMs: t, pos: p, tempo: "run", posOk: true, tempoFromMotion: true });
    }
    const after = r.e.s.active.find((x) => x.id === "test");
    expect(after === undefined || after.state === "gone").toBe(true);
  });
  it("ett sällsynt djur som flyr är borta direkt", () => {
    const r = approach("walk");
    let t = r.t;
    for (let i = 0; i < 60; i++) { t += 1000; r.e.step({ tMs: t, pos: simPoint(500, -560), tempo: "still", posOk: true }); }
    const a = r.e.s.active.find((x) => x.id === "test");
    expect(a === undefined || a.state === "gone").toBe(true);
  });
  it("tillståndet går att spara och återställa (JSON) utan att något ändras", () => {
    const e = new WorldEngine(newEngineState(T0), env);
    const { t } = walk(e, [-960, -960], [-960, 0], 1.3, "walk", T0);
    const copy = new WorldEngine(JSON.parse(JSON.stringify(e.s)), env);
    const a = walk(e, [-960, 0], [-500, 0], 1.3, "walk", t).ev, b = walk(copy, [-960, 0], [-500, 0], 1.3, "walk", t).ev;
    expect(a).toEqual(b);
  });
});
