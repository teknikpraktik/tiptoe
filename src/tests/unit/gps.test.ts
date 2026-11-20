// Origin: teknikpraktik/solosurvival@033a121 src/tests/unit/gps.test.ts
import { describe, expect, it } from "vitest";
import { GpsFilter, classifyAccuracy } from "@/gps/filters/filter";
import { canPhotograph, canTrack } from "@/gps/types";
import { fromLocal } from "@/geo/geometry";
import { ORIGIN } from "./helpers";

const fix = (x: number, y: number, t: number, acc = 5) => {
  const p = fromLocal(ORIGIN, { x, y });
  return { latitude: p.lat, longitude: p.lon, accuracyM: acc, timestampMs: t };
};

describe("GPS-filter", () => {
  it("klassificerar noggrannhet enligt Tiptoe-specen (foto < 25 m, spår < 30 m)", () => {
    expect(classifyAccuracy(8)).toBe("ok");
    expect(classifyAccuracy(15)).toBe("fair");
    expect(classifyAccuracy(24.9)).toBe("fair");
    expect(classifyAccuracy(25)).toBe("weak");
    expect(classifyAccuracy(30)).toBe("poor");
    expect(classifyAccuracy(50)).toBe("poor");
    expect(canPhotograph("fair")).toBe(true);
    expect(canPhotograph("weak")).toBe(false);
    expect(canTrack("weak")).toBe(true);
    expect(canTrack("poor")).toBe(false);
  });
  it("avvisar ogiltiga koordinater", () => {
    const f = new GpsFilter({ maxPlausibleSpeedMps: 8 });
    expect(f.push({ latitude: 200, longitude: 0, accuracyM: 5, timestampMs: 1000 }, 1000).verdict).toBe("invalid");
    expect(f.push({ latitude: NaN, longitude: 0, accuracyM: 5, timestampMs: 1000 }, 1000).verdict).toBe("invalid");
  });
  it("avvisar gamla fixar", () => {
    const f = new GpsFilter({ maxPlausibleSpeedMps: 8 });
    expect(f.push(fix(0, 0, 0), 60_000).verdict).toBe("stale");
  });
  it("avvisar hopp på 300 m men accepterar bestående flytt", () => {
    const f = new GpsFilter({ maxPlausibleSpeedMps: 8 });
    f.push(fix(0, 0, 0), 0);
    f.push(fix(3, 0, 1000), 1000);
    expect(f.push(fix(300, 0, 2000), 2000).verdict).toBe("jump");
    expect(f.position!.lon).toBeCloseTo(fromLocal(ORIGIN, { x: 3, y: 0 }).lon, 4);
    f.push(fix(301, 0, 3000), 3000);
    expect(f.push(fix(302, 0, 4000), 4000).verdict).toBe("reacquired");
  });
  it("skapar ingen konstgjord rörelse för stillastående spelare", () => {
    const f = new GpsFilter({ maxPlausibleSpeedMps: 8 });
    for (let i = 0; i < 20; i++) f.push(fix(Math.sin(i) * 4, Math.cos(i) * 4, i * 1000, 6), i * 1000);
    const p = f.position!;
    const o = fromLocal(ORIGIN, { x: 0, y: 0 });
    expect(Math.abs(p.lat - o.lat) * 111_320).toBeLessThan(5);
  });
  it("blir otillgänglig utan nya fixar", () => {
    const f = new GpsFilter({ maxPlausibleSpeedMps: 8 });
    f.push(fix(0, 0, 0), 0);
    expect(f.qualityAt(2000)).toBe("ok");
    expect(f.qualityAt(9000)).toBe("unavailable");
  });
});

