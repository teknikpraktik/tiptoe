import { describe, expect, it } from "vitest";
import { dayPhase, solarElevationDeg } from "@/engine/sun";

const STHLM = { lat: 59.33, lon: 18.07 };
const at = (iso: string) => Date.parse(iso);

describe("solens läge och dygnets fas", () => {
  it("solhöjd vid midsommar och midvinter i Stockholm (±1°)", () => {
    // Solens högsta höjd ≈ 90 − 59,33 + 23,44 = 54,1° (midsommar) och ≈ 7,2° (midvinter), kring 11:48 UTC.
    let maxS = -90, maxW = -90;
    for (let m = 0; m < 24 * 60; m += 5) {
      maxS = Math.max(maxS, solarElevationDeg(at("2026-06-21T00:00:00Z") + m * 60_000, STHLM.lat, STHLM.lon));
      maxW = Math.max(maxW, solarElevationDeg(at("2026-12-21T00:00:00Z") + m * 60_000, STHLM.lat, STHLM.lon));
    }
    expect(maxS).toBeCloseTo(54.1, 0);
    expect(Math.abs(maxW - 7.2)).toBeLessThan(1);
  });
  it("faser i Stockholm en novemberdag (UTC+1)", () => {
    expect(dayPhase(at("2026-11-21T11:00:00Z"), STHLM.lat, STHLM.lon)).toBe("day");
    expect(dayPhase(at("2026-11-21T22:00:00Z"), STHLM.lat, STHLM.lon)).toBe("night");
    // Soluppgång ~07:30 lokal tid (06:30 UTC), solnedgång ~15:00 (14:00 UTC).
    expect(dayPhase(at("2026-11-21T06:15:00Z"), STHLM.lat, STHLM.lon)).toBe("dawn");
    expect(dayPhase(at("2026-11-21T14:30:00Z"), STHLM.lat, STHLM.lon)).toBe("dusk");
  });
  it("midsommarnatt i Kiruna: ingen natt", () => {
    for (let h = 0; h < 24; h++) expect(dayPhase(at("2026-06-21T00:00:00Z") + h * 3_600_000, 67.85, 20.22)).not.toBe("night");
  });
});
