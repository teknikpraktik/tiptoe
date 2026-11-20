// Origin: teknikpraktik/solosurvival@033a121 src/tests/unit/helpers.ts
import { fromLocal, type LatLon } from "@/geo/geometry";

/** Punkt `distM` meter från `p` i riktningen `bearingDeg` (0 = norr). */
export function destinationPoint(p: LatLon, distM: number, bearingDeg: number): LatLon {
  const b = (bearingDeg * Math.PI) / 180;
  return fromLocal(p, { x: Math.sin(b) * distM, y: Math.cos(b) * distM });
}

/** Gemensam testorigo (samma som Outbreaks `sim/test-graphs` ORIGIN). */
export const ORIGIN: LatLon = { lat: 59.38, lon: 13.5 };
