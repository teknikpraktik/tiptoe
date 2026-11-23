import { describe, expect, it } from "vitest";
import { computeReserves, simplify, splitTrack, DEFAULT_RESERVE_OPTIONS, type Reserve, type TrackPoint } from "@/geo/reserves/reserves";
import { clipper2Ts } from "@/geo/reserves/ops-clipper2-ts";
import type { PolygonOps } from "@/geo/reserves/ops";
import { ORIGIN, filtered, rect, walk } from "@/sim/tracks";
import { fromLocal } from "@/geo/geometry";

const LIBS: PolygonOps[] = [clipper2Ts];

const run = (ops: PolygonOps, track: TrackPoint[], existing: Reserve[] = [], options = {}) => {
  let n = 0;
  return computeReserves(ops, { track, existing, nowMs: 1, newId: () => `r${++n}`, options });
};
const ha = (m2: number) => m2 / 10_000;

for (const ops of LIBS) describe(`reservatsgeometri (${ops.name})`, () => {
  it("en sluten slinga runt ett kvarter (100 × 120 m) ger rätt areal inom ±10 %", () => {
    const r = run(ops, walk(rect(0, 0, 100, 120)));
    expect(r.created).toHaveLength(1);
    expect(r.addedM2 / 12_000).toBeGreaterThan(0.9);
    expect(r.addedM2 / 12_000).toBeLessThan(1.1);
    expect(r.reserves[0].areaM2).toBeCloseTo(r.addedM2, 0);
  });
  it("samma kvarter med GPS-brus ±10 m (genom GpsFilter som i appen): fortfarande inom ±10 %", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = run(ops, filtered(walk(rect(0, 0, 100, 120), { noiseM: 5, seed }))); // σ 5 m ⇒ ~95 % inom ±10 m
      expect(r.addedM2 / 12_000, `seed ${seed}`).toBeGreaterThan(0.9);
      expect(r.addedM2 / 12_000, `seed ${seed}`).toBeLessThan(1.1);
    }
  });
  it("nästan sluten slinga: glapp ≤ 30 m sluts, glapp ≥ 80 m sluts inte", () => {
    for (const g of [10, 20, 30]) expect(run(ops, walk(rect(0, 0, 150, 150, g))).created, `glapp ${g}`).toHaveLength(1);
    for (const g of [80, 100]) expect(run(ops, walk(rect(0, 0, 150, 150, g))).created, `glapp ${g}`).toHaveLength(0);
  });
  it("ett glapp i gångfart överbryggas (som när man pratar i telefon och går vidare); i bilfart bryts spåret", () => {
    const loop = walk(rect(0, 0, 150, 150));
    // Ta bort punkter så att det blir ett hål i spåret mitt på en sida. Tiden går som om man gått sträckan.
    const cut = (len: number) => { const i = 40, k = Math.round(len / 5); return [...loop.slice(0, i), ...loop.slice(i + k)]; };
    expect(run(ops, cut(40)).created).toHaveLength(1);
    expect(run(ops, cut(70)).created).toHaveLength(1);
    // Samma 70 m men på 5 s (14 m/s, bil): bryts, och slingan sluts inte.
    const fast = (() => { const i = 40, k = 14; const a = loop.slice(0, i), b = loop.slice(i + k); const shift = b[0].tMs - a[a.length - 1].tMs - 5000; return [...a, ...b.map((p) => ({ ...p, tMs: p.tMs - shift }))]; })();
    const broken = run(ops, fast);
    expect(broken.breaks.some((b) => b.reason === "gap")).toBe(true);
    expect(broken.created).toHaveLength(0);
  });
  it("avbrott: 200 m under ett samtal på 4 minuter fylls i och slingan blir ett reservat; 1,8 km eller över en timme gör det inte", () => {
    // En slinga 300 × 300 m där en hel sida (200 m av 300) saknas: spelaren pratade i telefon.
    const sides = walk(rect(0, 0, 300, 300));
    const startGap = sides.findIndex((p) => p.tMs > sides[0].tMs + (350 / 1.3) * 1000);
    const resume = startGap + Math.round(200 / 5);
    const callLoop = [...sides.slice(0, startGap), ...sides.slice(resume).map((p) => ({ ...p, tMs: p.tMs + 90_000 }))];
    const ok = run(ops, callLoop);
    expect(ok.breaks.some((b) => b.reason === "gap")).toBe(false);
    expect(ok.created).toHaveLength(1);
    // Över en timme: bryts (glömd promenad).
    const late = [...sides.slice(0, startGap), ...sides.slice(resume).map((p) => ({ ...p, tMs: p.tMs + 3_700_000 }))];
    expect(run(ops, late).breaks.some((b) => b.reason === "gap")).toBe(true);
    // 1,8 km bort: bryts.
    const a = walk([[0, 0], [100, 0]]);
    const b = walk([[1900, 0], [2000, 0]], { t0: a[a.length - 1].tMs + 600_000 });
    expect(run(ops, [...a, ...b]).breaks.some((x) => x.reason === "gap")).toBe(true);
  });
  it("ett GPS-hopp (en punkt 300 m bort) skapar ingen orimlig areal", () => {
    const loop = walk(rect(0, 0, 100, 120));
    const p = loop[30];
    const jump = fromLocal(ORIGIN, { x: 400, y: 400 });
    loop[30] = { ...p, lat: jump.lat, lon: jump.lon };
    const r = run(ops, loop);
    expect(r.breaks.some((b) => b.reason === "jump")).toBe(true);
    expect(r.addedM2 / 12_000).toBeGreaterThan(0.9);
    expect(r.addedM2 / 12_000).toBeLessThan(1.1);
  });
  it("ett bestående GPS-hopp (flera punkter långt bort) bryter spåret i stället för att skapa yta", () => {
    const a = walk([[0, 0], [100, 0]]);
    const b = walk([[600, 600], [700, 600], [700, 700]], { t0: a[a.length - 1].tMs + 1000 });
    const c = walk([[100, 120], [0, 120], [0, 0]], { t0: b[b.length - 1].tMs + 1000 });
    const r = run(ops, [...a, ...b, ...c]);
    expect(r.breaks.some((x) => x.reason === "speed" || x.reason === "gap")).toBe(true);
    expect(r.addedM2).toBeLessThan(1000);
  });
  it("dålig noggrannhet (≥ 30 m) används inte", () => {
    const r = run(ops, walk(rect(0, 0, 100, 120), { acc: 35 }));
    expect(r.created).toHaveLength(0);
  });
  it("för hög fart för länge (cykel) ger ingen yta", () => {
    const r = run(ops, walk(rect(0, 0, 200, 200), { speed: 6 }));
    expect(r.created).toHaveLength(0);
    expect(r.breaks.some((b) => b.reason === "speed")).toBe(true);
  });
  it("kort språngmarsch (under 20 s över 12 km/h) bryter inte slingan", () => {
    const a = walk([[0, 0], [0, 120]]);
    const b = walk([[0, 120], [60, 120]], { speed: 4, t0: a[a.length - 1].tMs });
    const c = walk([[60, 120], [100, 120], [100, 0], [0, 0]], { t0: b[b.length - 1].tMs });
    expect(run(ops, [...a, ...b.slice(1), ...c.slice(1)]).created).toHaveLength(1);
  });
  it("åtta (självkorsning) ger två ytor", () => {
    const eight = walk([[0, 0], [200, 200], [200, 0], [0, 200], [0, 0]]);
    const r = run(ops, eight);
    // Två trianglar à 10 000 m² som möts i korsningen: de blir ett reservat (korsningen binder ihop dem), ytan ska vara rätt.
    expect(r.addedM2).toBeGreaterThan(20_000 * 0.85);
    expect(r.addedM2).toBeLessThan(20_000 * 1.1);
  });
  it("utstickare (gå ut och tillbaka samma väg) ger ingen yta", () => {
    const spur = walk([[0, 0], [0, 200], [0, 0]]);
    expect(run(ops, spur).created).toHaveLength(0);
    // Utstickare från en slinga: bara slingans yta räknas.
    const loopSpur = walk([[0, 0], [0, 120], [0, 250], [0, 120], [100, 120], [100, 0], [0, 0]]);
    const r = run(ops, loopSpur);
    expect(r.addedM2 / 12_000).toBeGreaterThan(0.9);
    expect(r.addedM2 / 12_000).toBeLessThan(1.1);
  });
  it("liten slinga (< 0,1 ha) ger ingen yta", () => {
    expect(run(ops, walk(rect(0, 0, 25, 25), { stepM: 3 })).created).toHaveLength(0);
  });
  it("återanslutning: en U-sväng som slutar mot ett befintligt reservat sluter ytan mot gränsen", () => {
    const first = run(ops, walk(rect(0, 0, 100, 100)));
    const old = first.reserves;
    // U ut från reservatets östra kant och tillbaka: x 100 → 200, y 10 → 90.
    const u = walk([[100, 10], [200, 10], [200, 90], [100, 90]], { t0: 1e6 });
    const r = run(ops, u, old);
    expect(r.created).toHaveLength(0);
    expect(r.grown).toEqual([old[0].id]);
    expect(r.reserves).toHaveLength(1);
    // Ny yta ≈ 100 × 80 = 8 000 m² (±15 %, rundade hörn mot gränsen).
    expect(r.addedM2).toBeGreaterThan(8000 * 0.85);
    expect(r.addedM2).toBeLessThan(8000 * 1.15);
  });
  it("två reservat som växer ihop blir ett, och arealen räknas inte två gånger", () => {
    const a = run(ops, walk(rect(0, 0, 100, 100))).reserves;
    let n = 10;
    const b = computeReserves(ops, { track: walk(rect(200, 0, 100, 100)), existing: a, nowMs: 2, newId: () => `r${++n}` }).reserves;
    expect(b).toHaveLength(2);
    const before = b.reduce((s, x) => s + x.areaM2, 0);
    // En slinga som täcker mellanrummet och överlappar båda.
    const r = computeReserves(ops, { track: walk(rect(50, 0, 200, 100)), existing: b, nowMs: 3, newId: () => `r${++n}` });
    expect(r.reserves).toHaveLength(1);
    expect(r.merged).toHaveLength(1);
    expect(r.merged[0].into).toBe(r.reserves[0].id);
    const total = r.reserves[0].areaM2;
    expect(total).toBeCloseTo(before + r.addedM2, -1);
    expect(total / 30_000).toBeGreaterThan(0.9);
    expect(total / 30_000).toBeLessThan(1.1);
  });
  it("att gå samma slinga igen lägger inte till något", () => {
    const a = run(ops, walk(rect(0, 0, 100, 120)));
    const r = run(ops, walk(rect(0, 0, 100, 120), { t0: 1e6, noiseM: 3, seed: 9 }), a.reserves);
    expect(r.addedM2).toBeLessThan(12_000 * 0.08);
    expect(r.reserves).toHaveLength(1);
  });
  it("taket per promenad: en yta över taket läggs inte till", () => {
    const r = run(ops, walk(rect(0, 0, 400, 400)), [], { maxNewAreaPerWalkM2: 100_000 });
    expect(r.created).toHaveLength(0);
    expect(r.capped).toHaveLength(1);
    const ok = run(ops, walk(rect(0, 0, 100, 100)), [], { maxNewAreaPerWalkM2: 100_000, addedThisWalkM2: 95_000 });
    expect(ok.capped).toHaveLength(1);
  });
  it("standardvärdena följer specen", () => {
    expect(DEFAULT_RESERVE_OPTIONS.minNewAreaM2).toBe(1000);
    expect(DEFAULT_RESERVE_OPTIONS.bridgeGapM).toBe(50);
    expect([DEFAULT_RESERVE_OPTIONS.longGapM, DEFAULT_RESERVE_OPTIONS.longGapS, Math.round(DEFAULT_RESERVE_OPTIONS.longGapMps * 3.6)]).toEqual([300, 3600, 9]);
    expect(ha(DEFAULT_RESERVE_OPTIONS.maxNewAreaPerWalkM2)).toBe(50);
    expect(DEFAULT_RESERVE_OPTIONS.maxAccuracyM).toBe(30);
    expect(DEFAULT_RESERVE_OPTIONS.halfToleranceM).toBeGreaterThanOrEqual(15);
    expect(DEFAULT_RESERVE_OPTIONS.halfToleranceM).toBeLessThanOrEqual(20);
  });
});

describe("spårhjälpare", () => {
  it("Douglas–Peucker tar bort punkter på en rak linje", () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i * 5, y: (i % 2) * 2 }));
    expect(simplify(pts, 5)).toHaveLength(2);
    expect(simplify([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }], 5)).toHaveLength(3);
  });
  it("splitTrack: tomt spår och enstaka punkt", () => {
    expect(splitTrack([], DEFAULT_RESERVE_OPTIONS, ORIGIN).runs).toHaveLength(0);
    expect(splitTrack(walk([[0, 0]]), DEFAULT_RESERVE_OPTIONS, ORIGIN).runs).toHaveLength(0);
  });
});

describe("spåret på kartan", () => {
  it("gångna delar heldragna, ifyllda glapp som raka streckade linjer, inget över glapp som inte godtas", async () => {
    const { trackForMap } = await import("@/geo/reserves/reserves");
    const a = walk([[0, 0], [100, 0]]);
    const b = walk([[300, 0], [400, 0]], { t0: a[a.length - 1].tMs + 180_000 }); // 200 m på 3 min: ifyllt
    const c = walk([[3000, 0], [3100, 0]], { t0: b[b.length - 1].tMs + 120_000 }); // 2,6 km på 2 min: inte
    const m = trackForMap([...a, ...b, ...c]);
    expect(m.solid).toHaveLength(3);
    expect(m.bridged).toHaveLength(1);
  });
});
