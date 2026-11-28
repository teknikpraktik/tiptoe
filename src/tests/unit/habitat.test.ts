import { describe, expect, it } from "vitest";
import { WORLD } from "@/engine/config";
import { SPECIES, WATER_ZONE, speciesWeight } from "@/engine/species";
import { candidates, cellOf, idlePose, waterAt } from "@/engine/world";
import { WATER_CLEARANCE_M, makeEnvironment, safeSpot } from "@/geo/environment";
import { fromLocal, type LatLon } from "@/geo/geometry";
import type { MvtFeature } from "@/geo/mvt";
import { isUpland } from "@/geo/regions";

const O: LatLon = { lat: 59.38, lon: 13.5 };
const L = (x: number, y: number) => fromLocal(O, { x, y });
const rect = (x0: number, y0: number, x1: number, y1: number) => [L(x0, y0), L(x1, y0), L(x1, y1), L(x0, y1)];
const poly = (layer: string, cls: string, ring: LatLon[]): MvtFeature => ({ layer, type: 3, props: { class: cls }, polygons: [[ring]] });
const line = (layer: string, cls: string, pts: [number, number][], props: Record<string, string> = {}): MvtFeature =>
  ({ layer, type: 2, props: { class: cls, ...props }, lines: [pts.map(([x, y]) => L(x, y))] });

/** Skog 1 × 1 km med stigar var 40:e meter, en bäck längs x = 0, ett dike längs x = 300, en liten damm och en kulvert. */
function streamForest(): MvtFeature[] {
  const f: MvtFeature[] = [poly("landcover", "wood", rect(-500, -500, 500, 500))];
  for (let k = -480; k <= 480; k += 40) { f.push(line("transportation", "path", [[k, -500], [k, 500]])); f.push(line("transportation", "path", [[-500, k], [500, k]])); }
  f.push(line("waterway", "stream", [[0, -500], [0, 500]]));
  f.push(line("waterway", "ditch", [[300, -500], [300, 500]]));
  f.push(line("waterway", "stream", [[-300, -500], [-300, 500]], { brunnel: "tunnel" }));
  f.push(poly("water", "pond", rect(-220, 200, -200, 220)));
  return f;
}

describe("höglänt terräng (ren)", () => {
  it("Sälen, Branäs, Idre, Funäsdalen, Åre och Abisko är höglänta; låglandet och kusten inte", () => {
    for (const [lat, lon] of [[61.16, 13.26], [60.64, 12.87], [61.86, 12.71], [62.54, 12.55], [63.4, 13.08], [68.35, 18.82], [67.85, 20.22]]) expect(isUpland({ lat, lon }), `${lat},${lon}`).toBe(true);
    for (const [lat, lon] of [[59.33, 18.07], [59.38, 13.5], [57.7, 11.97], [63.83, 20.26], [65.58, 22.15], [60.6, 15.63], [61.0, 14.54], [55.6, 13.0]]) expect(isUpland({ lat, lon }), `${lat},${lon}`).toBe(false);
  });
  it("renen har vikt bara i höglänt terräng", () => {
    const base = { habitat: "open" as const, forestNear: false, water: { distToWater: () => Infinity }, phase: "day" as const, level: 0 as const };
    expect(speciesWeight(SPECIES.reindeer, base)).toBe(0);
    expect(speciesWeight(SPECIES.reindeer, { ...base, upland: true })).toBeGreaterThan(0);
  });
});

describe("vattendrag och säkerhetsavstånd till vatten", () => {
  const env = makeEnvironment(streamForest());
  it("bäckar räknas, diken och kulvertar inte", () => {
    expect(env.waterDistM(L(30, 0), 100, 5000, true)).toBeCloseTo(30, 0);
    expect(env.waterDistM(L(30, 0), 100, 5000, false)).toBe(Infinity);
    expect(env.waterDistM(L(290, 0), 5, 0, true)).toBe(Infinity); // diket
    expect(env.waterDistM(L(-295, 0), 20, 0, true)).toBe(Infinity); // kulverten
  });
  it("inget djur får stå närmare än 12 m till en bäck eller en damm, oavsett art", () => {
    expect(WATER_ZONE.minM).toBe(WATER_CLEARANCE_M);
    expect(safeSpot(env, L(5, 20))).toBe(false);
    expect(safeSpot(env, L(15, 20))).toBe(true);
    expect(safeSpot(env, L(-210, 225))).toBe(false); // 5 m från dammen
    expect(safeSpot(env, L(-210, 240))).toBe(true);
    expect(safeSpot(env, L(300, 20))).toBe(true); // diket är ingen fara
  });
  it("bäver och utter finns vid bäcken (12–100 m), och inga djur hamnar eller vandrar nära vatten", () => {
    let water = 0;
    for (let w = 0; w < 12; w++) // 12 fönster × 6 individer per ruta = lika många som förut (24 × 3)
    for (let x = -450; x <= 450; x += 250) for (let y = -450; y <= 450; y += 250) {
      const win = Math.floor(Date.UTC(2026, 5, 1) / WORLD.windowMs) + w;
      for (const c of candidates(cellOf(L(x, y)), win, env)) {
        expect(waterAt(env, c.home).distToWater(0, true), c.id).toBeGreaterThanOrEqual(WATER_CLEARANCE_M);
        if (c.species === "beaver" || c.species === "otter") {
          water++;
          const d = waterAt(env, c.home).distToWater(WATER_ZONE.defaultAreaM2, true);
          expect(d).toBeLessThanOrEqual(WATER_ZONE.maxM);
        }
        for (let s = 0; s <= 7200; s += 600) expect(waterAt(env, idlePose(c, c.window * WORLD.windowMs + s * 1000, env).pos).distToWater(0, true)).toBeGreaterThanOrEqual(WATER_CLEARANCE_M);
      }
    }
    expect(water).toBeGreaterThan(0);
  });
});

describe("havsörnen vid kusten eller stora sjöar", () => {
  const ctx = (env: ReturnType<typeof makeEnvironment>, p: LatLon) => ({ habitat: "forest" as const, forestNear: false, water: waterAt(env, p), phase: "day" as const, level: 3 as const, rarityWeight: { common: 1, uncommon: 1, rare: 1, very_rare: 1 } });
  it("inte vid en sjö på 10 ha, men vid en på 64 ha och vid havet", () => {
    const small = makeEnvironment([poly("water", "lake", rect(0, 0, 316, 316))]);
    const big = makeEnvironment([poly("water", "lake", rect(0, 0, 800, 800))]);
    const sea = makeEnvironment([poly("water", "ocean", rect(0, 0, 100, 100))]); // en liten bit hav i rutan räcker
    expect(speciesWeight(SPECIES.white_tailed_eagle, ctx(small, L(-50, 100)))).toBe(0);
    expect(speciesWeight(SPECIES.white_tailed_eagle, ctx(big, L(-50, 100)))).toBeGreaterThan(0);
    expect(speciesWeight(SPECIES.white_tailed_eagle, ctx(sea, L(-50, 50)))).toBeGreaterThan(0);
  });
});
