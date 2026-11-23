import { fromLocal, haversineM, toLocal, type LatLon } from "@/geo/geometry";
import { multiArea, polyArea, ringArea, type MultiPoly, type Poly, type PolygonOps, type Pt } from "./ops";

/**
 * Reservatsgeometri, "buffra och fyll" (spec: Reservat → Geometri och Validering). Ren funktion, körbar i Node.
 *
 * 1. Spåret delas i sammanhängande delar: dåliga fixar bort, enstaka GPS-hopp bort, glapp under 50 m (och tidsmässigt rimliga) och avbrott upp till 300 m i gångfart överbryggas,
 *    längre glapp och för hög fart bryter spåret.
 * 2. Varje del förenklas (Douglas–Peucker) och buffras med halva slutningstoleransen till en korridor.
 * 3. Korridoren slås ihop med spelarens befintliga reservat. Varje inre hål som korridoren gränsar till och som är minst 0,1 ha är innesluten yta.
 * 4. Hålet plus den del av korridoren som ligger runt det (hålet buffrat tillbaka med samma avstånd ≈ ytan innanför den gångna linjen) blir ny
 *    reservatsyta, inom taket per promenad.
 * 5. Allt slås ihop med befintliga reservat. Reservat som växer ihop blir ett (det största behåller sitt id). Arealen räknas på den sammanslagna
 *    ytan, så inget räknas två gånger.
 */
export interface TrackPoint extends LatLon {
  tMs: number;
  accuracyM: number;
}

export interface Reserve {
  id: string;
  /** Yttre ring och hål, [lon, lat] som GeoJSON (ringarna är inte slutna). */
  rings: [number, number][][];
  areaM2: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReserveOptions {
  /** Halva slutningstoleransen (m): buffertens radie. Glipor upp till två gånger detta sluts. */
  halfToleranceM: number;
  simplifyM: number;
  /** Utjämning längs spåret (m åt varje håll) före förenklingen: punktvis GPS-brus gör annars korridoren taggig och hålet för litet. */
  smoothM: number;
  minNewAreaM2: number;
  /** Glapp mellan två spårpunkter som överbryggas (m, s). */
  bridgeGapM: number;
  bridgeGapS: number;
  /**
   * Längre glapp (avbrott: samtal, appen i bakgrunden, en titt i menyn) fylls också i med en rak linje, om de är högst `longGapM` långa,
   * högst `longGapS` sekunder och snittfarten över glappet är högst `longGapMps` (gång eller lugn löpning; inte bil).
   */
  longGapM: number;
  longGapS: number;
  longGapMps: number;
  /** Maxfart (m/s) och hur länge den får överskridas (s) innan spåret bryts. */
  maxSpeedMps: number;
  speedToleranceS: number;
  /** Över denna fart är en enstaka punkt ett GPS-hopp. */
  jumpSpeedMps: number;
  maxAccuracyM: number;
  /** Tak för ny yta per promenad (m²) och hur mycket som redan lagts till under promenaden. */
  maxNewAreaPerWalkM2: number;
  addedThisWalkM2: number;
}

export const DEFAULT_RESERVE_OPTIONS: ReserveOptions = {
  halfToleranceM: 18,
  simplifyM: 5,
  smoothM: 10,
  minNewAreaM2: 1000,
  bridgeGapM: 50,
  bridgeGapS: 120,
  longGapM: 300,
  longGapS: 3600,
  longGapMps: 9 / 3.6,
  maxSpeedMps: 12 / 3.6,
  speedToleranceS: 20,
  jumpSpeedMps: 25 / 3.6,
  maxAccuracyM: 30,
  maxNewAreaPerWalkM2: 500_000,
  addedThisWalkM2: 0,
};

export type BreakReason = "gap" | "speed" | "jump" | "accuracy";

export interface ReserveResult {
  /** Alla spelarens reservat efter operationen. */
  reserves: Reserve[];
  /** Ny yta (m²) som lagts till, efter sammanslagning (inget dubbelräknat). */
  addedM2: number;
  created: string[];
  grown: string[];
  /** Reservat som vuxit ihop: `from` finns inte längre, de ingår i `into`. */
  merged: { into: string; from: string[] }[];
  /** Inneslutna ytor som inte lades till eftersom taket per promenad nåddes. */
  capped: number[];
  /** Var spåret bröts och varför (för fältloggen). */
  breaks: { atMs: number; reason: BreakReason }[];
  /** Nya ytor (lat/lon) för animationen när en slinga sluts. */
  newPieces: [number, number][][][];
}

// ---------- 1. Spårets delar ----------

/** Glapp som binds ihop med en rak linje: korta glapp som förut, och avbrott upp till `longGapM` i gångfart (generöst; inte bil). */
export function bridgeable(dM: number, dtS: number, o: Pick<ReserveOptions, "bridgeGapM" | "bridgeGapS" | "longGapM" | "longGapS" | "longGapMps">): boolean {
  if (dM < o.bridgeGapM && dtS <= o.bridgeGapS) return true;
  return dM <= o.longGapM && dtS <= o.longGapS && dM / Math.max(1, dtS) <= o.longGapMps;
}

/** Gräns (m) över vilken ett överbryggat glapp visas streckat på kartan (ifyllt, inte gånget). */
export const DRAWN_GAP_M = 30;

/**
 * Spåret för kartan: heldragna delar som gåtts, streckade raka linjer där ett glapp fyllts i, och inget alls över glapp som inte
 * godtas (t.ex. en bilresa). Samma regel som reservatsberäkningen.
 */
export function trackForMap(pts: TrackPoint[], o: ReserveOptions = DEFAULT_RESERVE_OPTIONS): { solid: LatLon[][]; bridged: [LatLon, LatLon][] } {
  const solid: LatLon[][] = [];
  const bridged: [LatLon, LatLon][] = [];
  let cur: LatLon[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[i - 1];
    if (!q) { cur.push(p); continue; }
    const d = haversineM(q, p), dt = (p.tMs - q.tMs) / 1000;
    if (d < DRAWN_GAP_M || (d < o.bridgeGapM && dt <= o.bridgeGapS)) { cur.push(p); continue; }
    if (cur.length > 1) solid.push(cur);
    if (bridgeable(d, dt, o)) bridged.push([q, p]);
    cur = [p];
  }
  if (cur.length) solid.push(cur);
  return { solid, bridged };
}

export function splitTrack(pts: TrackPoint[], o: ReserveOptions, origin: LatLon): { runs: (Pt & { t: number })[][]; breaks: ReserveResult["breaks"] } {
  const breaks: ReserveResult["breaks"] = [];
  const good = pts.filter((p) => {
    const ok = Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.accuracyM < o.maxAccuracyM;
    return ok;
  }).map((p) => ({ ...toLocal(origin, p), t: p.tMs }));
  // Enstaka hopp: en punkt som ligger orimligt långt från både föregående och nästa, när de två grannarna ligger rimligt nära varandra.
  const speed = (a: { x: number; y: number; t: number }, b: { x: number; y: number; t: number }) => Math.hypot(b.x - a.x, b.y - a.y) / Math.max(0.5, (b.t - a.t) / 1000);
  const clean: typeof good = [];
  for (let i = 0; i < good.length; i++) {
    const prev = clean[clean.length - 1], cur = good[i], next = good[i + 1];
    if (prev && next && speed(prev, cur) > o.jumpSpeedMps && speed(cur, next) > o.jumpSpeedMps && speed(prev, next) <= o.jumpSpeedMps) {
      breaks.push({ atMs: cur.t, reason: "jump" });
      continue;
    }
    clean.push(cur);
  }
  const runs: (Pt & { t: number })[][] = [];
  let run: typeof clean = [];
  let fastSince: number | null = null;
  let fastStartIdx = 0;
  const close = () => { if (run.length >= 2) runs.push(run); run = []; };
  for (const p of clean) {
    const prev = run[run.length - 1];
    if (!prev) { run.push(p); continue; }
    const d = Math.hypot(p.x - prev.x, p.y - prev.y), dt = (p.t - prev.t) / 1000;
    const v = d / Math.max(0.5, dt);
    if (!bridgeable(d, dt, o)) { breaks.push({ atMs: p.t, reason: "gap" }); close(); fastSince = null; run.push(p); continue; }
    if (v > o.jumpSpeedMps) { breaks.push({ atMs: p.t, reason: "speed" }); close(); fastSince = null; run.push(p); continue; }
    if (v > o.maxSpeedMps) {
      if (fastSince === null) { fastSince = prev.t; fastStartIdx = run.length - 1; }
      if ((p.t - fastSince) / 1000 > o.speedToleranceS) {
        // För fort för länge (cykel, bil): delen före den snabba sträckan behålls, den snabba kastas.
        breaks.push({ atMs: p.t, reason: "speed" });
        run = run.slice(0, fastStartIdx + 1);
        close();
        fastSince = null;
        run.push(p);
        continue;
      }
    } else fastSince = null;
    run.push(p);
  }
  close();
  return { runs, breaks };
}

/** Glidande medelvärde längs spåret: varje punkt ersätts med medelvärdet av punkterna inom `halfM` meter (längs spåret) åt varje håll. */
export function smooth(pts: Pt[], halfM: number): Pt[] {
  if (halfM <= 0 || pts.length < 3) return pts.slice();
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const out: Pt[] = [];
  let a = 0, b = 0, sx = 0, sy = 0;
  for (let i = 0; i < pts.length; i++) {
    while (b < pts.length && cum[b] - cum[i] <= halfM) { sx += pts[b].x; sy += pts[b].y; b++; }
    while (cum[i] - cum[a] > halfM) { sx -= pts[a].x; sy -= pts[a].y; a++; }
    // Ändpunkterna behålls: de avgör om slingan sluts.
    out.push(i === 0 || i === pts.length - 1 ? pts[i] : { x: sx / (b - a), y: sy / (b - a) });
  }
  return out;
}

/** Douglas–Peucker. */
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a], B = pts[b];
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      const d = len === 0 ? Math.hypot(P.x - A.x, P.y - A.y) : Math.abs(dy * P.x - dx * P.y + B.x * A.y - B.y * A.x) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// ---------- 2–5. Buffra och fyll ----------

const ll = (origin: LatLon, r: Pt[]): [number, number][] => r.map((p) => { const q = fromLocal(origin, p); return [q.lon, q.lat]; });
const local = (origin: LatLon, r: [number, number][]): Pt[] => r.map(([lon, lat]) => toLocal(origin, { lat, lon }));
const reservePoly = (origin: LatLon, r: Reserve): Poly => ({ outer: local(origin, r.rings[0]), holes: r.rings.slice(1).map((h) => local(origin, h)) });

export interface ReserveInput {
  track: TrackPoint[];
  existing: Reserve[];
  nowMs: number;
  newId: () => string;
  options?: Partial<ReserveOptions>;
}

export function computeReserves(ops: PolygonOps, input: ReserveInput): ReserveResult {
  const o = { ...DEFAULT_RESERVE_OPTIONS, ...input.options };
  const empty = (breaks: ReserveResult["breaks"] = []): ReserveResult => ({ reserves: input.existing, addedM2: 0, created: [], grown: [], merged: [], capped: [], breaks, newPieces: [] });
  if (input.track.length < 3) return empty();
  const origin: LatLon = { lat: input.track[0].lat, lon: input.track[0].lon };
  const { runs, breaks } = splitTrack(input.track, o, origin);
  if (!runs.length) return empty(breaks);
  const lines = runs.map((r) => simplify(smooth(r, o.smoothM), o.simplifyM));
  const r = o.halfToleranceM;
  const corridor = ops.bufferLines(lines, r);
  const existing: MultiPoly = input.existing.map((x) => reservePoly(origin, x));
  const existingAll = existing.length ? ops.union(existing, []) : [];
  const existingArea = multiArea(existingAll);
  const all = ops.union(corridor, existingAll);

  // Hål som den nya korridoren gränsar till (inte gamla hål i reservat som spelaren inte rört).
  const corridorTouch = ops.bufferPolys(corridor, 1);
  const candidates: Poly[] = [];
  for (const p of all) for (const h of p.holes) {
    if (ringArea(h) < o.minNewAreaM2 * 0.5) continue; // hålet växer med bufferten; slutlig yta prövas nedan
    const hole: Poly = { outer: h, holes: [] };
    if (multiArea(ops.intersect([hole], corridorTouch)) > 0.01) candidates.push(hole);
  }
  // Hålet buffrat tillbaka = ytan innanför den gångna linjen, begränsad till hål + korridor + befintliga reservat.
  const pieces = candidates
    .map((h) => ops.intersect(ops.bufferPolys([h], r, "miter"), ops.union([h], all)))
    .map((m) => ({ m, area: multiArea(m) }))
    .filter((x) => x.area >= o.minNewAreaM2)
    .sort((a, b) => a.area - b.area);

  // Tak per promenad: minsta ytorna först, så att en stor felaktig yta (GPS-fel) inte tränger undan riktiga.
  const accepted: MultiPoly = [];
  const capped: number[] = [];
  let budget = o.maxNewAreaPerWalkM2 - o.addedThisWalkM2;
  for (const p of pieces) {
    if (p.area <= budget) { accepted.push(...p.m); budget -= p.area; } else capped.push(p.area);
  }
  if (!accepted.length) return { ...empty(breaks), capped };

  const merged = ops.union(existingAll, accepted);
  const addedM2 = Math.max(0, multiArea(merged) - existingArea);

  // Id: ett nytt reservat som överlappar ett eller flera gamla behåller det största gamlas id; de andra går upp i det.
  const out: Reserve[] = [];
  const created: string[] = [], grown: string[] = [], mergedInfo: ReserveResult["merged"] = [];
  const oldByIdx = input.existing.map((x, i) => ({ x, poly: existing[i], area: polyArea(existing[i]) }));
  for (const p of merged) {
    const area = polyArea(p);
    const overl = oldByIdx.filter((o2) => multiArea(ops.intersect([p], [o2.poly])) > 1).sort((a, b) => b.area - a.area);
    const rings = [ll(origin, p.outer), ...p.holes.map((h) => ll(origin, h))];
    if (!overl.length) {
      const id = input.newId();
      created.push(id);
      out.push({ id, rings, areaM2: area, createdAt: input.nowMs, updatedAt: input.nowMs });
      continue;
    }
    const keep = overl[0].x;
    const grew = area > overl.reduce((s, x) => s + x.area, 0) + 1;
    if (overl.length > 1) mergedInfo.push({ into: keep.id, from: overl.slice(1).map((x) => x.x.id) });
    if (grew || overl.length > 1) grown.push(keep.id);
    out.push({ ...keep, rings: grew || overl.length > 1 ? rings : keep.rings, areaM2: grew || overl.length > 1 ? area : keep.areaM2, updatedAt: grew || overl.length > 1 ? input.nowMs : keep.updatedAt });
  }
  return {
    reserves: out,
    addedM2,
    created,
    grown,
    merged: mergedInfo,
    capped,
    breaks,
    newPieces: accepted.map((p) => [ll(origin, p.outer), ...p.holes.map((h) => ll(origin, h))]),
  };
}

/** Total areal (m²) över alla reservat. Reservaten överlappar aldrig (de slås ihop), så summan räknar inget två gånger. */
export const totalAreaM2 = (rs: Reserve[]): number => rs.reduce((s, r) => s + r.areaM2, 0);
