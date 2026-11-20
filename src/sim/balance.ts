// Mönster från teknikpraktik/solosurvival@033a121 src/sim/* (simulerade spelare mot motorn). Nytt innehåll.
import type { Environment } from "@/geo/environment";
import { newEngineState, WorldEngine, type EngineEvent } from "@/engine/engine";
import { SPECIES, type SpeciesId } from "@/engine/species";
import { simEnvironment, simPoint } from "./env";

/**
 * Balanssimulator (spec: src/sim/ – mötesfrekvens per sträcka och miljö). En simulerad spelare går en slinga i jämn fart genom den
 * syntetiska miljön; motorn kör som i appen. Mätvärde: minuter per möte (ett djur som dyker upp).
 */
export type Route = "nature" | "urban" | "mixed";

const ROUTES: Record<Route, [number, number][]> = {
  // Skog, park och åker (inte bebyggelse).
  nature: [[-880, -880], [-880, 880], [-120, 880], [-120, -880], [880, -880], [880, -120], [-880, -120]],
  urban: [[120, 120], [120, 880], [880, 880], [880, 120], [120, 120], [440, 120], [440, 880]],
  // Genom alla fyra zonerna.
  mixed: [[-600, -600], [-600, 600], [600, 600], [600, -600], [-600, -600]],
};

export interface SimResult {
  route: Route;
  minutes: number;
  km: number;
  encounters: number;
  minPerEncounter: number;
  bySpecies: Partial<Record<SpeciesId, number>>;
  fled: number;
}

export function simulateWalk(route: Route, o: { minutes?: number; startMs?: number; speed?: number; env?: Environment } = {}): SimResult {
  const env = o.env ?? simEnvironment();
  const minutes = o.minutes ?? 60, v = o.speed ?? 1.3;
  const t0 = o.startMs ?? Date.UTC(2026, 5, 1, 8, 0, 0);
  const e = new WorldEngine(newEngineState(t0), env);
  const pts = ROUTES[route];
  const legs: { a: [number, number]; b: [number, number]; len: number }[] = [];
  for (let i = 1; i < pts.length; i++) legs.push({ a: pts[i - 1], b: pts[i], len: Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) });
  const loop = legs.reduce((s, l) => s + l.len, 0);
  const ev: EngineEvent[] = [];
  for (let s = 1; s <= minutes * 60; s++) {
    let d = (s * v) % loop;
    let p: [number, number] = pts[0];
    for (const l of legs) { if (d <= l.len) { const k = d / l.len; p = [l.a[0] + (l.b[0] - l.a[0]) * k, l.a[1] + (l.b[1] - l.a[1]) * k]; break; } d -= l.len; }
    ev.push(...e.step({ tMs: t0 + s * 1000, pos: simPoint(p[0], p[1]), tempo: "walk", posOk: true }));
  }
  const appear = ev.filter((x) => x.type === "appear") as Extract<EngineEvent, { type: "appear" }>[];
  const bySpecies: Partial<Record<SpeciesId, number>> = {};
  for (const a of appear) bySpecies[a.species] = (bySpecies[a.species] ?? 0) + 1;
  return { route, minutes, km: Math.round((minutes * 60 * v) / 100) / 10, encounters: appear.length, minPerEncounter: appear.length ? Math.round((minutes / appear.length) * 10) / 10 : Infinity, bySpecies, fled: ev.filter((x) => x.type === "flee").length };
}

/** Medelvärde över flera starttider (olika tidsfönster ⇒ olika individer). */
export function balanceReport(seeds = 6, minutes = 60): Record<Route, { minPerEncounter: number; runs: number[]; species: Partial<Record<SpeciesId, number>> }> {
  const out = {} as ReturnType<typeof balanceReport>;
  for (const route of ["nature", "mixed", "urban"] as Route[]) {
    const runs: number[] = [];
    const species: Partial<Record<SpeciesId, number>> = {};
    let enc = 0, min = 0;
    for (let k = 0; k < seeds; k++) {
      const r = simulateWalk(route, { minutes, startMs: Date.UTC(2026, 5, 1, 8, 0, 0) + k * 7_200_000 * 5 });
      runs.push(r.minPerEncounter);
      enc += r.encounters; min += r.minutes;
      for (const [s, n] of Object.entries(r.bySpecies)) species[s as SpeciesId] = (species[s as SpeciesId] ?? 0) + n;
    }
    out[route] = { minPerEncounter: Math.round((min / Math.max(1, enc)) * 10) / 10, runs, species };
  }
  return out;
}

export const speciesNames = Object.keys(SPECIES);
