import { toLocal, type LatLon } from "./geometry";
import { decodeFeatures, type MvtFeature } from "./mvt";
import type { TileFetcher } from "./blockers";
import { MAJOR_ROAD_CLASSES, ROAD_CLEARANCE_M } from "./point-check";
import { tileRange } from "./blockers";

/**
 * Miljöuppslag ur samma vektortiles som kartan (spec: Djur och spelvärld → Miljö; OpenMapTiles-schema): habitat för arternas vikter,
 * spärrade ytor (vatten, byggnad), faror (större väg och järnväg med marginal, som `point-check.ts`), gångbara linjer och skydd (skog).
 * Ren logik på avkodade objekt, testbar i Node. Polygoner och linjer ligger i ett grovt rutnät så att en fråga bara prövar de närmaste.
 */
export type Habitat = "forest" | "wetland" | "park" | "grass" | "field" | "urban" | "open" | "water";

export const ENV_LAYERS = new Set(["landcover", "landuse", "park", "water", "waterway", "building", "transportation"]);
/** Vattendrag som räknas (åar, bäckar, kanaler). Diken räknas inte: de finns överallt i odlingslandskapet. Kulvertar (tunnel) räknas inte. */
export const STREAM_CLASSES = new Set(["river", "stream", "canal"]);
/**
 * Säkerhet för barn: inget djur står, vandrar eller flyr närmare än så här till vatten eller ett vattendrag (öppet vatten eller is),
 * så att ingen följer ett djur ner i vattnet. Samma gräns som vattenzonens inre kant.
 */
export const WATER_CLEARANCE_M = 12;
/** Linjer man kan gå längs (spec: djur hålls inom 60 m från gångbara linjer). Större vägar är faror, inte gångvägar. */
export const WALKABLE_CLASSES = new Set(["path", "track", "minor", "service", "pedestrian"]);
export const ENV_ZOOM = 14;

export interface Environment {
  habitat(p: LatLon): Habitat;
  /** I vatten eller byggnad (spec: aldrig in i byggnader eller vatten). */
  blocked(p: LatLon): boolean;
  /** Sträckan a–b går in i vatten eller en byggnad (exakt: ändpunkterna och skärning med polygonkanterna). */
  segmentBlocked(a: LatLon, b: LatLon): boolean;
  /** Inom marginalen från större väg eller järnväg, eller närmare än `WATER_CLEARANCE_M` till vatten eller ett vattendrag. */
  hazard(p: LatLon): boolean;
  /** Avstånd (m) till närmaste gångbara linje, högst `maxM` (Infinity om ingen inom `maxM`). */
  walkableDistM(p: LatLon, maxM: number): number;
  /**
   * Avstånd (m) till närmaste vatten med minst `minAreaM2` yta (standard: allt vatten utom bassänger), högst `maxM`. Hav räknas som
   * obegränsat stort. Med `streams` räknas även åar och bäckar (linjer), oavsett storlek.
   */
  waterDistM(p: LatLon, maxM: number, minAreaM2?: number, streams?: boolean): number;
  /** Skog inom `r` m (skogsbryn och skydd vid flykt). */
  forestWithin(p: LatLon, r: number): boolean;
  /** Antal objekt (för diagnostik). */
  size: number;
}

type Ring = LatLon[];
interface PolyRec { kind: string; rings: Ring[]; s: number; w: number; n: number; e: number; areaM2: number }
interface LineRec { kind: string; pts: LatLon[]; s: number; w: number; n: number; e: number }

/** Rutnätets cell i grader (~110 × 55 m på 59° N). */
const CELL = 0.001;

/** Klassning av ett polygonobjekt, eller null om det inte påverkar spelet. */
function polyKind(f: MvtFeature): string | null {
  const c = String(f.props.class ?? "");
  switch (f.layer) {
    case "water": return c === "swimming_pool" ? null : "water";
    case "building": return "building";
    case "park": return "park";
    case "landcover":
      if (c === "wood" || c === "forest") return "forest";
      if (c === "wetland") return "wetland";
      if (c === "grass") return "grass";
      if (c === "farmland") return "field";
      return null;
    case "landuse":
      if (["residential", "commercial", "industrial", "retail", "school", "hospital", "railway", "kindergarten", "university", "college"].includes(c)) return "urban";
      if (["cemetery", "playground", "pitch", "stadium", "garden"].includes(c)) return "park";
      return null;
  }
  return null;
}

function lineKind(f: MvtFeature): string | null {
  if (f.props.brunnel === "tunnel") return null;
  if (f.layer === "waterway") return STREAM_CLASSES.has(String(f.props.class ?? "")) ? "stream" : null;
  if (f.layer !== "transportation") return null;
  const c = String(f.props.class ?? "");
  if (c === "rail") return "rail";
  if (MAJOR_ROAD_CLASSES.includes(c)) return "major";
  if (WALKABLE_CLASSES.has(c)) return "walk";
  return null;
}

function inRing(p: LatLon, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}

function segDistM(p: LatLon, a: LatLon, b: LatLon): number {
  const A = toLocal(p, a), B = toLocal(p, b);
  const dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, (-A.x * dx - A.y * dy) / len2)) : 0;
  return Math.hypot(A.x + t * dx, A.y + t * dy);
}

/** Ytan (m²) av en ring i lat/lon (lokal plan runt första punkten). Vattenytor som delas av tile-gränser blir här mindre än de är. */
function ringAreaM2(r: Ring): number {
  if (r.length < 3) return 0;
  const o = r[0];
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const P = toLocal(o, r[i]), Q = toLocal(o, r[j]); a += Q.x * P.y - P.x * Q.y; }
  return Math.abs(a) / 2;
}

/** Prioritet när flera ytor överlappar (det mest specifika vinner). */
const HABITAT_ORDER: Habitat[] = ["water", "wetland", "forest", "park", "field", "grass", "urban"];

export function makeEnvironment(features: MvtFeature[]): Environment {
  const polys = new Map<string, PolyRec[]>();
  const lines = new Map<string, LineRec[]>();
  const key = (i: number, j: number) => `${i},${j}`;
  const addTo = <T extends { s: number; w: number; n: number; e: number }>(m: Map<string, T[]>, rec: T, padDeg = 0) => {
    for (let i = Math.floor((rec.s - padDeg) / CELL); i <= Math.floor((rec.n + padDeg) / CELL); i++)
      for (let j = Math.floor((rec.w - padDeg * 2) / CELL); j <= Math.floor((rec.e + padDeg * 2) / CELL); j++) {
        const k = key(i, j);
        const l = m.get(k);
        if (l) l.push(rec); else m.set(k, [rec]);
      }
  };
  let size = 0;
  for (const f of features) {
    if (f.type === 3) {
      const kind = polyKind(f);
      if (!kind) continue;
      for (const rings of f.polygons ?? []) {
        if (!rings.length || rings[0].length < 3) continue;
        let s = 90, w = 180, n = -90, e = -180;
        for (const p of rings[0]) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); }
        addTo(polys, { kind, rings, s, w, n, e, areaM2: kind === "water" && f.props.class === "ocean" ? Infinity : kind === "water" ? ringAreaM2(rings[0]) - rings.slice(1).reduce((a, h) => a + ringAreaM2(h), 0) : 0 });
        size++;
      }
    } else {
      const kind = lineKind(f);
      if (!kind) continue;
      for (const pts of f.lines ?? []) {
        // Varje segment för sig: långa vägar skulle annars ligga i hundratals celler.
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          addTo(lines, { kind, pts: [a, b], s: Math.min(a.lat, b.lat), n: Math.max(a.lat, b.lat), w: Math.min(a.lon, b.lon), e: Math.max(a.lon, b.lon) });
        }
        size++;
      }
    }
  }
  const polysAt = (p: LatLon) => polys.get(key(Math.floor(p.lat / CELL), Math.floor(p.lon / CELL))) ?? [];
  const containing = (p: LatLon) => polysAt(p).filter((r) => p.lat >= r.s && p.lat <= r.n && p.lon >= r.w && p.lon <= r.e && inRing(p, r.rings[0]) && !r.rings.slice(1).some((h) => inRing(p, h)));
  const near = <T extends { s: number; w: number; n: number; e: number }>(m: Map<string, T[]>, p: LatLon, r: number): T[] => {
    const dLat = r / 111_320, dLon = r / (111_320 * Math.cos((p.lat * Math.PI) / 180));
    const seen = new Set<T>();
    for (let i = Math.floor((p.lat - dLat) / CELL); i <= Math.floor((p.lat + dLat) / CELL); i++)
      for (let j = Math.floor((p.lon - dLon) / CELL); j <= Math.floor((p.lon + dLon) / CELL); j++)
        for (const x of m.get(key(i, j)) ?? []) if (x.n >= p.lat - dLat && x.s <= p.lat + dLat && x.e >= p.lon - dLon && x.w <= p.lon + dLon) seen.add(x);
    return [...seen];
  };
  const lineDist = (p: LatLon, kinds: Set<string>, maxM: number) => {
    let best = Infinity;
    for (const l of near(lines, p, maxM)) if (kinds.has(l.kind)) best = Math.min(best, segDistM(p, l.pts[0], l.pts[1]));
    return best <= maxM ? best : Infinity;
  };
  const polyDist = (p: LatLon, kind: string, maxM: number, minAreaM2 = 0) => {
    let best = Infinity;
    for (const r of near(polys, p, maxM)) {
      if (r.kind !== kind || r.areaM2 < minAreaM2) continue;
      if (inRing(p, r.rings[0]) && !r.rings.slice(1).some((h) => inRing(p, h))) return 0;
      for (const ring of r.rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) best = Math.min(best, segDistM(p, ring[j], ring[i]));
    }
    return best <= maxM ? best : Infinity;
  };
  const WALK = new Set(["walk"]), HAZ = new Set(["major", "rail"]), STREAM = new Set(["stream"]);
  const cross = (p1: LatLon, p2: LatLon, p3: LatLon, p4: LatLon) => {
    const d = (a: LatLon, b: LatLon, c: LatLon) => (c.lon - a.lon) * (b.lat - a.lat) - (b.lon - a.lon) * (c.lat - a.lat);
    const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  };
  return {
    size,
    habitat(p) {
      const kinds = new Set(containing(p).map((r) => r.kind));
      if (kinds.has("building")) return "urban";
      for (const h of HABITAT_ORDER) if (kinds.has(h)) return h;
      return "open";
    },
    blocked(p) { return containing(p).some((r) => r.kind === "water" || r.kind === "building"); },
    segmentBlocked(a, b) {
      if (this.blocked(a) || this.blocked(b)) return true;
      const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
      const half = Math.hypot(toLocal(a, b).x, toLocal(a, b).y) / 2 + 1;
      for (const r of near(polys, mid, half)) {
        if (r.kind !== "water" && r.kind !== "building") continue;
        for (const ring of r.rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if (cross(a, b, ring[j], ring[i])) return true;
      }
      return false;
    },
    hazard(p) {
      return lineDist(p, HAZ, ROAD_CLEARANCE_M) <= ROAD_CLEARANCE_M
        || polyDist(p, "water", WATER_CLEARANCE_M) <= WATER_CLEARANCE_M || lineDist(p, STREAM, WATER_CLEARANCE_M) <= WATER_CLEARANCE_M;
    },
    walkableDistM: (p, maxM) => lineDist(p, WALK, maxM),
    waterDistM: (p, maxM, minAreaM2 = 0, streams = false) => Math.min(polyDist(p, "water", maxM, minAreaM2), streams ? lineDist(p, STREAM, maxM) : Infinity),
    forestWithin: (p, r) => polyDist(p, "forest", r) <= r,
  };
}

/** Miljön runt en punkt ur vektortiles (z14). Null om någon ruta inte kunde hämtas (då spawnar inga djur där). */
export async function loadEnvironment(center: LatLon, radiusM: number, fetchTile: TileFetcher): Promise<Environment | null> {
  const r = tileRange(center, radiusM, ENV_ZOOM);
  const feats: MvtFeature[] = [];
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) {
    let buf: Uint8Array | null;
    try { buf = await fetchTile(ENV_ZOOM, x, y); } catch { return null; }
    if (buf) feats.push(...decodeFeatures(buf, ENV_ZOOM, x, y, ENV_LAYERS));
  }
  return makeEnvironment(feats);
}

/** Säker plats för ett djur (spec: Säkerhet för barn): inte i vatten/byggnad, inte nära större väg/järnväg eller vatten, inom `maxWalkM` från gångbar linje. */
export function safeSpot(env: Environment, p: LatLon, maxWalkM = 60): boolean {
  return !env.blocked(p) && !env.hazard(p) && env.walkableDistM(p, maxWalkM) <= maxWalkM;
}

/** Hela sträckan a–b är säker (prov var `stepM` meter): djur går aldrig genom ett hus eller över en större väg. */
export function safeSegment(env: Environment, a: LatLon, b: LatLon, maxWalkM = 60, stepM = 2): boolean {
  if (env.segmentBlocked(a, b)) return false;
  const d = Math.hypot(toLocal(a, b).x, toLocal(a, b).y);
  const k = Math.max(1, Math.ceil(d / stepM));
  for (let i = 1; i <= k; i++) {
    const t = i / k;
    if (!safeSpot(env, { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t }, maxWalkM)) return false;
  }
  return true;
}
