import type { DayPhase } from "./species";

/**
 * Solens höjd över horisonten (grader) för en plats och tid: NOAA:s förenklade formler (noggrannhet ~0,5°, mer än nog för gryning/skymning).
 * Ren funktion, samma resultat på alla telefoner (bara grundläggande trigonometri).
 */
export function solarElevationDeg(tMs: number, lat: number, lon: number): number {
  const rad = Math.PI / 180;
  const d = tMs / 86_400_000 + 2440587.5 - 2451545.0; // dagar sedan J2000
  const g = (357.529 + 0.98560028 * d) * rad; // medelanomali
  const q = 280.459 + 0.98564736 * d; // medellängd
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad; // ekliptisk längd
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = ((gmst * 15 + lon) * rad - ra);
  const el = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha));
  return el / rad;
}

/** Gräns (grader) mellan skymning och natt, och mellan gryning/skymning och dag. */
export const TWILIGHT = { nightBelow: -6, dayAbove: 6 } as const;

/**
 * Dygnets fas: natt under −6°, dag över +6°, däremellan gryning (solen på väg upp) eller skymning (på väg ner).
 * I svensk sommar finns ingen natt i norr – då växlar det mellan skymning och gryning, som det ska.
 */
export function dayPhase(tMs: number, lat: number, lon: number): DayPhase {
  const el = solarElevationDeg(tMs, lat, lon);
  if (el > TWILIGHT.dayAbove) return "day";
  if (el < TWILIGHT.nightBelow) return "night";
  return solarElevationDeg(tMs + 20 * 60_000, lat, lon) > el ? "dawn" : "dusk";
}
