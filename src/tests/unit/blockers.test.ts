// Origin: teknikpraktik/solosurvival@033a121 src/tests/unit/blockers.test.ts
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { decodePolygons } from "@/geo/mvt";
import { BLOCKER_ZOOM, loadBlockers, makeBlockers, type Blockers, type TileFetcher } from "@/geo/blockers";
import { fromLocal, type LatLon } from "@/geo/geometry";

// Two real background-map tiles (OpenFreeMap, OpenStreetMap data, ODbL) around the test start in Karlstad.
const FIX = path.join(import.meta.dirname, "..", "fixtures", "mvt");
const tile = (z: number, x: number, y: number) => { const f = path.join(FIX, `${z}-${x}-${y}.pbf`); return existsSync(f) ? new Uint8Array(readFileSync(f)) : null; };
const fixtureFetcher: TileFetcher = async (z, x, y) => tile(z, x, y);
const START: LatLon = { lat: 59.40731, lon: 13.46753 };
const centroid = (ring: LatLon[]) => ({ lat: ring.reduce((a, p) => a + p.lat, 0) / ring.length, lon: ring.reduce((a, p) => a + p.lon, 0) / ring.length });

describe("vector tiles: buildings and water", () => {
  it("decodes polygons of the chosen layers from a real tile", () => {
    const t = decodePolygons(tile(14, 8805, 4811)!, 14, 8805, 4811, new Set(["building", "water"]));
    expect(t.layers.get("building")!.length).toBeGreaterThan(500);
    expect(t.layers.get("water")!.length).toBeGreaterThan(0);
    // Inside the tile's bounds.
    for (const poly of t.layers.get("building")!.slice(0, 50)) for (const p of poly[0]) { expect(p.lat).toBeGreaterThan(59.39); expect(p.lat).toBeLessThan(59.42); }
  });
});

describe("blockers", () => {
  let b: Blockers;
  let house: LatLon[];
  beforeAll(async () => {
    b = (await loadBlockers(START, 1500, BLOCKER_ZOOM, fixtureFetcher))!;
    house = decodePolygons(tile(14, 8805, 4811)!, 14, 8805, 4811, new Set(["building"])).layers.get("building")!.sort((p, q) => q[0].length - p[0].length)[0][0];
  });
  it("a point inside a building is blocked, open ground is not", () => {
    expect(b.blocked(centroid(house))).toBe(true);
    // Most ground is open: of a grid of points around the start, only a minority falls in a building or water.
    let n = 0, hit = 0;
    for (let x = -1000; x <= 1000; x += 50) for (let y = -500; y <= 500; y += 50) { n++; if (b.blocked(fromLocal(START, { x, y }))) hit++; }
    expect(hit).toBeGreaterThan(0);
    expect(hit / n).toBeLessThan(0.4);
    expect(makeBlockers([]).blocked(centroid(house))).toBe(false);
  });
  it("a segment through a building is blocked", () => {
    const c = centroid(house);
    expect(b.segmentBlocked(fromLocal(c, { x: -60, y: 0 }), fromLocal(c, { x: 60, y: 0 }))).toBe(true);
  });
  it("a tile that cannot be fetched means no blockers at all (zombies then stay on the trails)", async () => {
    expect(await loadBlockers(START, 500, BLOCKER_ZOOM, async () => { throw new Error("offline"); })).toBeNull();
  });
});


