import { describe, expect, it } from "vitest";
import { WORLD } from "@/engine/config";
import { newEngineState, WorldEngine, type EngineEvent } from "@/engine/engine";
import { ALL_SPECIES, SPECIES, WATER_ZONE, speciesWeight, type SpeciesId } from "@/engine/species";
import { dayPhase } from "@/engine/sun";
import { candidates, cellOf, idlePose, waterAt, windowOf, type Candidate } from "@/engine/world";
import { haversineM } from "@/geo/geometry";
import { simEnvironment, simPoint } from "@/sim/env";

const env = simEnvironment();
const O = simPoint(0, 0);
/** Första fönstret från `from` vars mitt har fasen `phase` (i den syntetiska miljön, 59,38° N). */
function windowWith(phase: string, from = Date.UTC(2026, 10, 21, 0, 0, 0)): number {
  for (let w = windowOf(from); w < windowOf(from) + 48; w++) if (dayPhase((w + 0.5) * WORLD.windowMs, O.lat, O.lon) === phase) return w;
  throw new Error(`ingen ${phase}`);
}
/** Alla individer i ett område (lokala meter) under några fönster. */
function sample(x0: number, x1: number, y0: number, y1: number, windows: number[]): Candidate[] {
  const out: Candidate[] = [];
  for (const w of windows) for (let x = x0; x <= x1; x += 250) for (let y = y0; y <= y1; y += 250) out.push(...candidates(cellOf(simPoint(x, y)), w, env));
  return out;
}
const count = (cs: Candidate[], s: SpeciesId) => cs.filter((c) => c.species === s).length;

describe("specens 15 arter och renen", () => {
  it("alla arter har klass, poäng och rimliga värden", () => {
    expect(ALL_SPECIES).toHaveLength(16);
    for (const id of ALL_SPECIES) {
      const s = SPECIES[id];
      expect(s.points).toBe({ common: 50, uncommon: 100, rare: 250, very_rare: 1000 }[s.rarity]);
      expect(s.photoM).toBeLessThanOrEqual(s.detectionM);
    }
    expect(ALL_SPECIES.filter((s) => SPECIES[s].rarity === "very_rare")).toEqual(["wolf", "brown_bear", "white_tailed_eagle"]);
  });
  it("mycket sällsynta arter finns inte utanför nivå 3", () => {
    const base = { habitat: "forest" as const, forestNear: false, water: { distToWater: () => 50 }, phase: "day" as const };
    for (const id of ["wolf", "brown_bear", "white_tailed_eagle"] as SpeciesId[]) {
      expect(speciesWeight(SPECIES[id], { ...base, level: 0 })).toBe(0);
      expect(speciesWeight(SPECIES[id], { ...base, level: 2 })).toBe(0);
    }
  });
});

describe("tid på dygnet", () => {
  it("igelkotten är aktiv på natten, ekorren på dagen (park och bebyggelse)", () => {
    const night = [windowWith("night"), windowWith("night", Date.UTC(2026, 10, 22))];
    const day = [windowWith("day"), windowWith("day", Date.UTC(2026, 10, 22))];
    const n = sample(-900, 900, 50, 950, night), d = sample(-900, 900, 50, 950, day);
    expect(count(n, "hedgehog")).toBeGreaterThan(count(d, "hedgehog"));
    expect(count(d, "squirrel")).toBeGreaterThan(count(n, "squirrel"));
    expect(count(n, "squirrel")).toBe(0);
  });
});

describe("vattenzoner (spec: Vatten)", () => {
  const dusk = [0, 1, 2, 3, 4, 5].map((k) => windowWith("dusk", Date.UTC(2026, 10, 1 + k)));
  const lakeArea = sample(-950, -250, -950, -250, dusk);
  it("bäver och utter finns bara på land 12–100 m från sjön, aldrig i den", () => {
    const water = lakeArea.filter((c) => c.species === "beaver" || c.species === "otter");
    expect(water.length).toBeGreaterThan(0);
    for (const c of water) {
      const d = waterAt(env, c.home).distToWater(WATER_ZONE.defaultAreaM2);
      expect(d, c.id).toBeGreaterThanOrEqual(WATER_ZONE.minM);
      expect(d, c.id).toBeLessThanOrEqual(WATER_ZONE.maxM);
      for (let s = 0; s <= 7200; s += 300) {
        const p = idlePose(c, c.window * WORLD.windowMs + s * 1000, env).pos;
        expect(env.blocked(p)).toBe(false);
        expect(waterAt(env, p).distToWater(WATER_ZONE.defaultAreaM2)).toBeGreaterThanOrEqual(WATER_ZONE.minM);
      }
    }
    expect(sample(100, 900, -900, -100, dusk).filter((c) => c.species === "beaver" || c.species === "otter")).toHaveLength(0); // åkern: inget vatten
  });
  it("en skrämd utter dyker undan mot vattnet och försvinner vid zonens inre gräns, inte ute på vattnet", () => {
    const w = dusk[0];
    const t0 = (w + 0.5) * WORLD.windowMs;
    const s = newEngineState(t0);
    const e = new WorldEngine(s, env);
    // En utter 40 m från sjöns östra strand (x = −500).
    const home = simPoint(-460, -600);
    s.active.push({ id: "o", species: "otter", seed: 7, cell: cellOf(home), window: w, n: 0, home, pos: home, headingDeg: 0, state: "graze", alarm: 1.5, disturbed: true, appearedAtMs: t0 });
    s.budget = -100;
    const ev: EngineEvent[] = [];
    let last = home;
    for (let i = 1; i <= 60; i++) {
      ev.push(...e.step({ tMs: t0 + i * 1000, pos: simPoint(-400, -600), tempo: "walk", posOk: true }));
      const a = s.active.find((x) => x.id === "o");
      if (a && a.state !== "gone") { last = a.pos; expect(env.blocked(a.pos)).toBe(false); }
    }
    expect(ev.find((x) => x.type === "gone" && x.id === "o")).toMatchObject({ reason: "dove" });
    // Den rörde sig mot vattnet (västerut) och slutade nära strandkanten men på land.
    expect(haversineM(last, simPoint(-500, -600))).toBeLessThan(20);
  });
});

describe("varianter (spec: sällsynta utseenden)", () => {
  it("tilldelas deterministiskt och bara för arter som har dem", () => {
    const all = sample(-950, 950, -950, 950, [windowWith("day"), windowWith("dusk"), windowWith("night")]);
    for (const c of all.filter((x) => x.variant)) expect(SPECIES[c.species].variants?.some((v) => v.id === c.variant)).toBe(true);
    const again = sample(-950, 950, -950, 950, [windowWith("day"), windowWith("dusk"), windowWith("night")]);
    expect(again.map((c) => c.variant ?? "")).toEqual(all.map((c) => c.variant ?? ""));
  });
});
