// Origin: teknikpraktik/solosurvival@033a121 src/tests/unit/geo.test.ts
import { describe, expect, it } from "vitest";
import { haversineM, fromLocal, polygonSelfIntersects, pointInPolygon } from "@/geo/geometry";
import { ORIGIN } from "./helpers";

describe("geometri", () => {
  it("haversine ≈ lokala meter", () => {
    const p = fromLocal(ORIGIN, { x: 300, y: 400 });
    expect(haversineM(ORIGIN, p)).toBeGreaterThan(499);
    expect(haversineM(ORIGIN, p)).toBeLessThan(501);
  });
  it("polygon: korsning och inneslutning", () => {
    expect(polygonSelfIntersects([[0, 0], [1, 1], [1, 0], [0, 1]])).toBe(true);
    expect(polygonSelfIntersects([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
    expect(pointInPolygon({ lat: 0.5, lon: 0.5 }, [[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true);
    expect(pointInPolygon({ lat: 2, lon: 0.5 }, [[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
  });
});


