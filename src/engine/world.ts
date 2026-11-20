import { fromLocal, toLocal, type LatLon } from "@/geo/geometry";
import { safeSegment, safeSpot, type Environment } from "@/geo/environment";
import { rand, type RngHolder } from "./core/rng";
import { BEHAVIOR, SPAWN, WORLD } from "./config";
import { hash32, idOf } from "./hash";
import { PHASE1_SPECIES, SPECIES, speciesWeight, type SpeciesId } from "./species";

/**
 * Den delade, deterministiska världen (spec: Djur och spelvärld → Deterministisk värld). Ingen server: varje telefon räknar fram samma
 * individer ur (ruta, tidsfönster, världsnyckel) och samma miljödata.
 */
export interface Cell { row: number; col: number }

const M_PER_DEG = 111_320;
const CELL_DLAT = WORLD.cellM / M_PER_DEG;

/** Rutnät i grader: rader med fast höjd, kolumner med bredd efter radens latitud (rutorna är ~250 × 250 m överallt). */
export function cellOf(p: LatLon): Cell {
  const row = Math.floor(p.lat / CELL_DLAT);
  return { row, col: Math.floor(p.lon / cellDLon(row)) };
}
function cellDLon(row: number): number {
  const lat = (row + 0.5) * CELL_DLAT;
  return WORLD.cellM / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
}
export function cellBounds(c: Cell): { s: number; n: number; w: number; e: number } {
  const dLon = cellDLon(c.row);
  return { s: c.row * CELL_DLAT, n: (c.row + 1) * CELL_DLAT, w: c.col * dLon, e: (c.col + 1) * dLon };
}
/** Rutor vars mittpunkt ligger inom `r` m (plus en halv ruta) från p. */
export function cellsAround(p: LatLon, r: number): Cell[] {
  const out: Cell[] = [];
  const c0 = cellOf(p);
  const k = Math.ceil(r / WORLD.cellM) + 1;
  for (let dr = -k; dr <= k; dr++) {
    const row = c0.row + dr;
    const dLon = cellDLon(row);
    const lat = (row + 0.5) * CELL_DLAT;
    const colC = Math.floor(p.lon / dLon);
    for (let dc = -k; dc <= k; dc++) {
      const col = colC + dc;
      const ctr = toLocal(p, { lat, lon: (col + 0.5) * dLon });
      if (Math.hypot(ctr.x, ctr.y) <= r + WORLD.cellM * 0.75) out.push({ row, col });
    }
  }
  return out;
}

export const windowOf = (tMs: number) => Math.floor(tMs / WORLD.windowMs);
export const cellSeed = (c: Cell, window: number) => hash32(WORLD.key, c.row, c.col, window);

/** En möjlig individ: samma på alla telefoner för samma ruta, fönster och miljö. */
export interface Candidate {
  id: string;
  species: SpeciesId;
  home: LatLon;
  /** Seed för individens egna slumpval (rörelser, flykt). */
  seed: number;
  cell: Cell;
  window: number;
  /** Ordning inom rutan (löpnummer). */
  n: number;
}

const rng = (seed: number): RngHolder => ({ rngState: seed >>> 0 });

/** Rutans möjliga individer i fönstret. Platser som inte är säkra hoppas över (deterministiskt: samma försök i samma ordning). */
export function candidates(c: Cell, window: number, env: Environment): Candidate[] {
  const seed = cellSeed(c, window);
  const b = cellBounds(c);
  const out: Candidate[] = [];
  for (let n = 0; n < WORLD.candidatesPerCell; n++) {
    const indSeed = hash32(seed, n);
    const r = rng(indSeed);
    let home: LatLon | null = null;
    for (let t = 0; t < WORLD.placeTries && !home; t++) {
      const p = { lat: b.s + (b.n - b.s) * rand(r), lon: b.w + (b.e - b.w) * rand(r) };
      if (safeSpot(env, p, SPAWN.maxFromWalkM)) home = p;
    }
    if (!home) continue;
    const hab = env.habitat(home);
    const forestNear = hab !== "forest" && env.forestWithin(home, 40);
    const weights = PHASE1_SPECIES.map((id) => speciesWeight(SPECIES[id], hab, forestNear));
    const total = weights.reduce((a, x) => a + x, 0);
    if (total <= 0) continue;
    let x = rand(r) * total, species = PHASE1_SPECIES[PHASE1_SPECIES.length - 1];
    for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) { species = PHASE1_SPECIES[i]; break; } }
    out.push({ id: idOf(indSeed), species, home, seed: indSeed, cell: c, window, n });
  }
  return out;
}

// ---------- Tomgång: rörelse som funktion av tiden (lat simulering vid observation) ----------

export type IdleState = "rest" | "graze" | "wander";
export interface IdlePose { pos: LatLon; state: IdleState; headingDeg: number }

/**
 * Var en ostörd individ är vid tiden `tMs`. Räknas fram från fönstrets början med individens egen seed: en följd av moment (vila, beta,
 * vandra) där vandringar bara går till säkra platser nära hemmet. Samma tid ger samma plats på alla telefoner; inget räknas i bakgrunden.
 */
export function idlePose(c: Candidate, tMs: number, env: Environment): IdlePose {
  const r = rng(hash32(c.seed, "idle"));
  const t0 = c.window * WORLD.windowMs;
  const sp = SPECIES[c.species];
  let pos = c.home, heading = rand(r) * 360, t = t0;
  const [l0, l1] = BEHAVIOR.idleLegS, [w0, w1] = BEHAVIOR.wanderM;
  for (let guard = 0; guard < 2000; guard++) {
    const kind = rand(r);
    const legS = l0 + (l1 - l0) * rand(r);
    if (kind < 0.45) {
      // Vandra till en ny plats (om den är säker och inom 80 m från hemmet).
      const dist = w0 + (w1 - w0) * rand(r);
      const dir = rand(r) * 360;
      const off = toLocal(c.home, pos);
      const a = (dir * Math.PI) / 180;
      const tgt = fromLocal(c.home, { x: off.x + Math.sin(a) * dist, y: off.y + Math.cos(a) * dist });
      const okTgt = Math.hypot(off.x + Math.sin(a) * dist, off.y + Math.cos(a) * dist) <= 80 && safeSegment(env, pos, tgt, SPAWN.maxFromWalkM);
      const dur = okTgt ? dist / sp.walkMps : legS;
      if (tMs < t + dur * 1000) {
        if (!okTgt) return { pos, state: "rest", headingDeg: heading };
        const k = (tMs - t) / (dur * 1000);
        return { pos: { lat: pos.lat + (tgt.lat - pos.lat) * k, lon: pos.lon + (tgt.lon - pos.lon) * k }, state: "wander", headingDeg: dir };
      }
      t += dur * 1000;
      if (okTgt) { pos = tgt; heading = dir; }
    } else {
      const state: IdleState = kind < 0.75 ? "graze" : "rest";
      if (tMs < t + legS * 1000) return { pos, state, headingDeg: heading };
      t += legS * 1000;
    }
  }
  return { pos, state: "rest", headingDeg: heading };
}
