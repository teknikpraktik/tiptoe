import { toLocal, type LatLon } from "@/geo/geometry";
import type { Reserve } from "@/geo/reserves/reserves";
import type { Rarity } from "./species";

/**
 * Reservatsnivåer (spec: Reservat → Reservatsnivåer). Nivån bestäms av reservatets totala areal och gäller inne i reservatet och i en zon runt
 * det. Nivån påverkar sällsynthet, inte antal möten.
 */
export type Level = 0 | 1 | 2 | 3;
export const LEVELS = {
  /** Undre gräns (m²) för nivå 1, 2 och 3. */
  minAreaM2: [10_000, 50_000, 200_000] as const,
  zoneM: 100,
  /** Klassvikter per nivå. Nivå 0 = utan reservat (samma som RARITY_WEIGHT). */
  rarity: [
    { common: 1, uncommon: 0.3, rare: 0.04, very_rare: 0 },
    { common: 1, uncommon: 0.6, rare: 0.06, very_rare: 0 },
    { common: 1, uncommon: 0.7, rare: 0.25, very_rare: 0 },
    { common: 1, uncommon: 0.7, rare: 0.3, very_rare: 0.08 },
  ] as Record<Rarity, number>[],
} as const;

export function levelForArea(m2: number): Level {
  const [a, b, c] = LEVELS.minAreaM2;
  return m2 >= c ? 3 : m2 >= b ? 2 : m2 >= a ? 1 : 0;
}

/** Areal (m²) som saknas till nästa nivå, eller null på nivå 3. */
export function toNextLevelM2(m2: number): number | null {
  const l = levelForArea(m2);
  return l >= 3 ? null : (LEVELS.minAreaM2 as readonly number[])[l] - m2;
}

interface Indexed { r: Reserve; level: Level; s: number; n: number; w: number; e: number; rings: LatLon[][] }

/** Uppslag av nivå på en plats bland en profils reservat. */
export class LevelIndex {
  private items: Indexed[];
  constructor(reserves: Reserve[]) {
    this.items = reserves.map((r) => {
      const rings = r.rings.map((ring) => ring.map(([lon, lat]) => ({ lat, lon })));
      let s = 90, n = -90, w = 180, e = -180;
      for (const p of rings[0] ?? []) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); }
      return { r, level: levelForArea(r.areaM2), s, n, w, e, rings };
    }).filter((x) => x.level > 0 && x.rings.length);
  }

  get empty(): boolean { return this.items.length === 0; }

  /** Högsta nivån för ett reservat som innehåller p eller ligger inom zonen (100 m) från p. */
  levelAt(p: LatLon): Level {
    let best: Level = 0;
    const dLat = LEVELS.zoneM / 111_320, dLon = LEVELS.zoneM / (111_320 * Math.cos((p.lat * Math.PI) / 180));
    for (const x of this.items) {
      if (x.level <= best || p.lat < x.s - dLat || p.lat > x.n + dLat || p.lon < x.w - dLon || p.lon > x.e + dLon) continue;
      if (inside(p, x.rings) || nearRings(p, x.rings, LEVELS.zoneM)) best = x.level;
    }
    return best;
  }

  /** Reservatet som innehåller p (för inflyttning), eller null. */
  reserveAt(p: LatLon): Reserve | null {
    for (const x of this.items) if (inside(p, x.rings)) return x.r;
    return null;
  }
}

function inRing(p: LatLon, ring: LatLon[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) c = !c;
  }
  return c;
}
export function inside(p: LatLon, rings: LatLon[][]): boolean {
  return inRing(p, rings[0]) && !rings.slice(1).some((h) => inRing(p, h));
}
function nearRings(p: LatLon, rings: LatLon[][], r: number): boolean {
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const A = toLocal(p, ring[j]), B = toLocal(p, ring[i]);
    const dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, (-A.x * dx - A.y * dy) / len2)) : 0;
    if (Math.hypot(A.x + t * dx, A.y + t * dy) <= r) return true;
  }
  return false;
}
