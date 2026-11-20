// Simulerade promenader (spik 2 och balanssimulatorn). Används av enhetstester, jämförelsesidan och simulatorn.
import { fromLocal, type LatLon } from "@/geo/geometry";
import type { TrackPoint } from "@/geo/reserves/reserves";
import { GpsFilter } from "@/gps/filters/filter";
import { MAX_PLAUSIBLE_SPEED_MPS } from "@/config/gps";

/** Syntetiska spår för reservatsgeometrin (spik 2). Lokala meter runt ORIGIN, en punkt per ~5 m, gångfart 1,3 m/s. */
export const ORIGIN: LatLon = { lat: 59.38, lon: 13.5 };

/** Seedad normalfördelning (Box–Muller på mulberry32). */
export function noiseGen(seed: number) {
  let s = seed >>> 0;
  const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return (sigma: number) => Math.sqrt(-2 * Math.log(Math.max(1e-12, u()))) * Math.cos(2 * Math.PI * u()) * sigma;
}

/** Gå längs hörnen (x, y i meter) med `stepM` mellan punkterna. */
export function walk(corners: [number, number][], o: { stepM?: number; speed?: number; t0?: number; noiseM?: number; seed?: number; acc?: number } = {}): TrackPoint[] {
  const step = o.stepM ?? 5, v = o.speed ?? 1.3;
  const n = noiseGen(o.seed ?? 1);
  const out: TrackPoint[] = [];
  let t = o.t0 ?? 0;
  const push = (x: number, y: number) => {
    const p = fromLocal(ORIGIN, { x: x + (o.noiseM ? n(o.noiseM) : 0), y: y + (o.noiseM ? n(o.noiseM) : 0) });
    out.push({ ...p, tMs: Math.round(t), accuracyM: o.acc ?? 6 });
  };
  push(corners[0][0], corners[0][1]);
  for (let i = 1; i < corners.length; i++) {
    const [ax, ay] = corners[i - 1], [bx, by] = corners[i];
    const d = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.round(d / step));
    for (let j = 1; j <= k; j++) { t += (d / k / v) * 1000; push(ax + ((bx - ax) * j) / k, ay + ((by - ay) * j) / k); }
  }
  return out;
}

/** Rektangel w × h med nedre vänstra hörnet i (x, y), medurs. Slutar `gapM` före startpunkten (0 = sluten). */
export function rect(x: number, y: number, w: number, h: number, gapM = 0): [number, number][] {
  return [[x, y], [x, y + h], [x + w, y + h], [x + w, y], [x + gapM, y]];
}

/** Spåret som appen sparar: rå GPS genom Outbreaks GpsFilter (spec: Geometri, steg 1). */
export function filtered(raw: TrackPoint[]): TrackPoint[] {
  const f = new GpsFilter({ maxPlausibleSpeedMps: MAX_PLAUSIBLE_SPEED_MPS });
  const out: TrackPoint[] = [];
  for (const p of raw) {
    const r = f.push({ latitude: p.lat, longitude: p.lon, accuracyM: p.accuracyM, timestampMs: p.tMs }, p.tMs);
    if ((r.verdict === "accepted" || r.verdict === "reacquired") && r.position) out.push({ ...r.position, tMs: p.tMs, accuracyM: p.accuracyM });
  }
  return out;
}
