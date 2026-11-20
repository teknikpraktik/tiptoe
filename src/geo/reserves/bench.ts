import { computeReserves, type Reserve, type TrackPoint } from "./reserves";
import type { PolygonOps } from "./ops";
import { filtered, rect, walk } from "@/sim/tracks";

/**
 * Jämförelse av polygonbibliotek (spik 2): samma fixturer och förväntningar som enhetstesterna, plus tidmätning på en lång promenad.
 * Körs i Node (`npx tsx scripts/spike2-bench.ts`) och i webbläsaren (`/spike/geometry/`) så att tiden kan mätas på telefon.
 */
interface Case { name: string; run(ops: PolygonOps): { ok: boolean; info: string } }

const go = (ops: PolygonOps, track: TrackPoint[], existing: Reserve[] = [], options = {}) => {
  let n = 0;
  return computeReserves(ops, { track, existing, nowMs: 1, newId: () => `r${++n}`, options });
};
const within = (x: number, want: number, tol: number) => Math.abs(x / want - 1) <= tol;
const pct = (x: number, want: number) => `${((x / want - 1) * 100).toFixed(1)} %`;

export const CASES: Case[] = [
  { name: "kvarter 100×120", run: (o) => { const r = go(o, walk(rect(0, 0, 100, 120))); return { ok: r.created.length === 1 && within(r.addedM2, 12_000, 0.1), info: pct(r.addedM2, 12_000) }; } },
  { name: "kvarter 100×100", run: (o) => { const r = go(o, walk(rect(0, 0, 100, 100))); return { ok: within(r.addedM2, 10_000, 0.1), info: pct(r.addedM2, 10_000) }; } },
  { name: "brus ±10 m (5 seeds)", run: (o) => { const xs = [1, 2, 3, 4, 5].map((seed) => go(o, filtered(walk(rect(0, 0, 100, 120), { noiseM: 5, seed }))).addedM2); return { ok: xs.every((x) => within(x, 12_000, 0.1)), info: xs.map((x) => pct(x, 12_000)).join(" ") }; } },
  { name: "glapp 30 m sluts", run: (o) => { const r = go(o, walk(rect(0, 0, 150, 150, 30))); return { ok: r.created.length === 1, info: `${r.created.length}` }; } },
  { name: "glapp 80 m sluts inte", run: (o) => { const r = go(o, walk(rect(0, 0, 150, 150, 80))); return { ok: r.created.length === 0, info: `${r.created.length}` }; } },
  { name: "GPS-hopp 550 m", run: (o) => { const t = walk(rect(0, 0, 100, 120)); t[30] = { ...t[30], lat: t[30].lat + 0.005, lon: t[30].lon + 0.005 }; const r = go(o, t); return { ok: within(r.addedM2, 12_000, 0.1), info: pct(r.addedM2, 12_000) }; } },
  { name: "åtta", run: (o) => { const r = go(o, walk([[0, 0], [200, 200], [200, 0], [0, 200], [0, 0]])); return { ok: within(r.addedM2, 20_000, 0.15), info: pct(r.addedM2, 20_000) }; } },
  { name: "utstickare", run: (o) => { const r = go(o, walk([[0, 0], [0, 120], [0, 250], [0, 120], [100, 120], [100, 0], [0, 0]])); return { ok: within(r.addedM2, 12_000, 0.1), info: pct(r.addedM2, 12_000) }; } },
  { name: "återanslutning mot gräns", run: (o) => { const a = go(o, walk(rect(0, 0, 100, 100))).reserves; const r = go(o, walk([[100, 10], [200, 10], [200, 90], [100, 90]], { t0: 1e6 }), a); return { ok: r.reserves.length === 1 && within(r.addedM2, 8000, 0.15), info: pct(r.addedM2, 8000) }; } },
  { name: "sammanväxning", run: (o) => { let n = 10; const a = go(o, walk(rect(0, 0, 100, 100))).reserves; const b = computeReserves(o, { track: walk(rect(200, 0, 100, 100)), existing: a, nowMs: 2, newId: () => `r${++n}` }).reserves; const r = computeReserves(o, { track: walk(rect(50, 0, 200, 100)), existing: b, nowMs: 3, newId: () => `r${++n}` }); return { ok: r.reserves.length === 1 && within(r.reserves[0].areaM2, 30_000, 0.1), info: `${r.reserves.length} st, ${pct(r.reserves[0]?.areaM2 ?? 0, 30_000)}` }; } },
];

/** En lång promenad (~45 min, ~3,5 km, fyra slingor, brus) mot fem befintliga reservat: realistisk värsta-fall-tid för en omräkning. */
export function longWalk(): { track: TrackPoint[]; existing: (ops: PolygonOps) => Reserve[] } {
  const legs: [number, number][] = [[0, 0], [0, 300], [250, 300], [250, 0], [500, 0], [500, 300], [250, 300], [250, 600], [0, 600], [0, 300], [-200, 300], [-200, 0], [0, 0]];
  const track = filtered(walk(legs, { noiseM: 4, seed: 7 }));
  const existing = (ops: PolygonOps) => {
    let all: Reserve[] = [];
    for (const [x, y] of [[700, 0], [700, 300], [900, 0], [-500, 0], [-500, 300]]) all = go(ops, walk(rect(x, y, 120, 150), { t0: x * 1e3 + y }), all).reserves;
    return all;
  };
  return { track, existing };
}

export interface BenchRow { lib: string; passed: number; total: number; failed: string[]; details: Record<string, string>; longWalkMs: number; longWalkPoints: number; longWalkHa: number }

export function runBench(libs: PolygonOps[], repeats = 9, now: () => number = () => performance.now()): BenchRow[] {
  const lw = longWalk();
  return libs.map((ops) => {
    const details: Record<string, string> = {};
    const failed: string[] = [];
    for (const c of CASES) {
      let res: { ok: boolean; info: string };
      try { res = c.run(ops); } catch (e) { res = { ok: false, info: `fel: ${String(e).slice(0, 80)}` }; }
      details[c.name] = `${res.ok ? "ok" : "FEL"} ${res.info}`;
      if (!res.ok) failed.push(c.name);
    }
    const existing = lw.existing(ops);
    const times: number[] = [];
    let ha = 0;
    for (let i = 0; i < repeats; i++) {
      const t0 = now();
      const r = go(ops, lw.track, existing);
      times.push(now() - t0);
      ha = r.addedM2 / 10_000;
    }
    times.sort((a, b) => a - b);
    return { lib: ops.name, passed: CASES.length - failed.length, total: CASES.length, failed, details, longWalkMs: Math.round(times[times.length >> 1] * 10) / 10, longWalkPoints: lw.track.length, longWalkHa: Math.round(ha * 100) / 100 };
  });
}
