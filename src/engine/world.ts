import { fromLocal, toLocal, type LatLon } from "@/geo/geometry";
import { safeSegment, safeSpot, type Environment } from "@/geo/environment";
import { rand, type RngHolder } from "./core/rng";
import { BEHAVIOR, SPAWN, WORLD } from "./config";
import { hash32, idOf } from "./hash";
import { ALL_SPECIES, SPECIES, WATER_ZONE, inWaterZone, speciesWeight, type DayPhase, type Rarity, type SpeciesId, type WaterContext } from "./species";
import { LEVELS, inside, type Level, type LevelIndex } from "./levels";
import { dayPhase } from "./sun";

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
  /** Sällsynt utseende (spec: Varianter), eller undefined. */
  variant?: string;
}

/** Vattnet runt en plats för artvikterna (lat: räknas bara om en vattenart frågar). */
export function waterAt(env: Environment, p: LatLon): WaterContext {
  const memo = new Map<number, number>();
  return { distToWater: (a) => { let d = memo.get(a); if (d === undefined) { d = env.waterDistM(p, WATER_ZONE.maxM + 1, a); memo.set(a, d); } return d; } };
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
    // Dygnets fas mitt i fönstret och mitt i rutan: samma för alla telefoner.
    const phase = dayPhase((window + 0.5) * WORLD.windowMs, (b.s + b.n) / 2, (b.w + b.e) / 2);
    const pick = pickSpecies(r, env, home, phase, 0);
    if (!pick) continue;
    const { species, variant } = pick;
    out.push({ id: idOf(indSeed), species, home, seed: indSeed, cell: c, window, n, ...(variant ? { variant } : {}) });
  }
  return out;
}

/**
 * Lotta art (och ev. variant) för en plats: habitat, skogsbryn, vattenzon, dygnsfas och reservatsnivå. `only` begränsar till vissa klasser
 * (inflyttning vid nivå 2 och 3). Samma slumpföljd som tidigare för basvärlden, så att den inte ändras.
 */
export function pickSpecies(r: RngHolder, env: Environment, home: LatLon, phase: DayPhase, level: Level, only?: Rarity[] | ((id: SpeciesId) => boolean)): { species: SpeciesId; variant?: string } | null {
  const hab = env.habitat(home);
  const forestNear = hab !== "forest" && env.forestWithin(home, 40);
  const ctx = { habitat: hab, forestNear, water: waterAt(env, home), phase, level, rarityWeight: LEVELS.rarity[level] };
  const allowed = (id: SpeciesId) => !only || (typeof only === "function" ? only(id) : only.includes(SPECIES[id].rarity));
  const weights = ALL_SPECIES.map((id) => (allowed(id) ? speciesWeight(SPECIES[id], ctx) : 0));
  const total = weights.reduce((a, x) => a + x, 0);
  if (total <= 0) return null;
  let x = rand(r) * total, species = ALL_SPECIES[ALL_SPECIES.length - 1];
  for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) { species = ALL_SPECIES[i]; break; } }
  let variant: string | undefined;
  for (const v of SPECIES[species].variants ?? []) if (rand(r) < v.chance) { variant = v.id; break; }
  return variant ? { species, variant } : { species };
}

/** Säker plats i en ruta (samma försök i samma ordning), eller null. */
function placeIn(r: RngHolder, env: Environment, b: ReturnType<typeof cellBounds>, ok: (p: LatLon) => boolean = () => true): LatLon | null {
  for (let t = 0; t < WORLD.placeTries; t++) {
    const p = { lat: b.s + (b.n - b.s) * rand(r), lon: b.w + (b.e - b.w) * rand(r) };
    if (safeSpot(env, p, SPAWN.maxFromWalkM) && ok(p)) return p;
  }
  return null;
}

/**
 * Reservatsdjur (per profil): i och runt profilens reservat finns fler möjliga individer, lottade med reservatsnivåns klassvikter (spec:
 * Reservatsnivåer – nivån styr sällsynthet, inte antal möten). Seeden innehåller profilens nyckel: syskon ser samma basdjur men var sina
 * reservatsdjur.
 */
export function reserveCandidates(c: Cell, window: number, env: Environment, profileKey: string, levels: LevelIndex): Candidate[] {
  if (levels.empty) return [];
  const b = cellBounds(c);
  const seed = hash32(WORLD.key, "reserve", profileKey, c.row, c.col, window);
  const phase = dayPhase((window + 0.5) * WORLD.windowMs, (b.s + b.n) / 2, (b.w + b.e) / 2);
  const out: Candidate[] = [];
  for (let n = 0; n < WORLD.reserveCandidatesPerCell; n++) {
    const indSeed = hash32(seed, n);
    const r = rng(indSeed);
    const home = placeIn(r, env, b, (p) => levels.levelAt(p) > 0);
    if (!home) continue;
    const pick = pickSpecies(r, env, home, phase, levels.levelAt(home));
    if (!pick) continue;
    out.push({ id: idOf(indSeed, "r"), species: pick.species, home, seed: indSeed, cell: c, window, n: 100 + n, ...(pick.variant ? { variant: pick.variant } : {}) });
  }
  return out;
}

/** Ett inflyttat djur (spec: Direkt återkoppling; nivå 2 – sällsynta arter kan slå sig ner och hittas igen). Per profil, sparas mellan promenader. */
export interface Resident {
  id: string;
  species: SpeciesId;
  variant?: string;
  home: LatLon;
  reserveId: string;
  since: number;
  reason: "moved_in" | "level2" | "level3";
}

/** Den inflyttades kandidat i ett fönster: samma individ, ny tomgångsbana per fönster. */
export function residentCandidate(r: Resident, window: number): Candidate {
  return { id: r.id, species: r.species, home: r.home, seed: hash32(r.id, window), cell: cellOf(r.home), window, n: 200, ...(r.variant ? { variant: r.variant } : {}) };
}

/** En inflyttning: en säker plats i ytan (lat/lon-ringar) och en art för platsens nivå. Deterministisk ur `seed`. */
export function chooseResident(env: Environment, rings: LatLon[][], seed: number, tMs: number, level: Level, only?: Rarity[], avoid?: { p: LatLon; m: number }): { home: LatLon; species: SpeciesId; variant?: string } | null {
  const r = rng(seed);
  let s = 90, n = -90, w = 180, e = -180;
  for (const p of rings[0] ?? []) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); }
  const phase = dayPhase(tMs, (s + n) / 2, (w + e) / 2);
  for (let t = 0; t < 40; t++) {
    const p = { lat: s + (n - s) * rand(r), lon: w + (e - w) * rand(r) };
    if (!inside(p, rings) || !safeSpot(env, p, SPAWN.maxFromWalkM)) continue;
    if (avoid && Math.hypot(toLocal(avoid.p, p).x, toLocal(avoid.p, p).y) < avoid.m) continue;
    const pick = pickSpecies(r, env, p, phase, level, only);
    if (pick) return { home: p, ...pick };
  }
  return null;
}

/** Arter som kan annonseras som observation: de sällsynta, och havsörnen (spec: nivå 3 eller sällsynt observation). */
export const OBSERVABLE: SpeciesId[] = ["capercaillie", "otter", "lynx", "white_tailed_eagle"];
export const OBSERVATION = { everyM: 1500, chance: 0.35, minM: 300, maxM: 900, durationMs: 45 * 60_000 } as const;

/**
 * En observation i närheten (spec: Miljö → Nudge och Arter): efter varje 1,5 km promenad finns en chans att en sällsynt art (eller havsörn vid
 * stora vatten) annonseras 300–900 m bort, i rätt miljö. Deterministisk ur profil, fönster och sträcka. `allowed` begränsar platsen
 * (hemområdet, fas 2.7).
 */
export function planObservation(env: Environment, player: LatLon, profileKey: string, tMs: number, kmIndex: number, allowed: (p: LatLon) => boolean = () => true): Candidate | null {
  const window = windowOf(tMs);
  const seed = hash32(WORLD.key, "obs", profileKey, window, kmIndex);
  const r = rng(seed);
  if (rand(r) >= OBSERVATION.chance) return null;
  const phase = dayPhase(tMs, player.lat, player.lon);
  for (let t = 0; t < 24; t++) {
    const d = OBSERVATION.minM + (OBSERVATION.maxM - OBSERVATION.minM) * rand(r), a = rand(r) * 2 * Math.PI;
    const p = fromLocal(player, { x: Math.sin(a) * d, y: Math.cos(a) * d });
    if (!allowed(p) || !safeSpot(env, p, SPAWN.maxFromWalkM)) continue;
    const pick = pickSpecies(r, env, p, phase, 3, (id) => OBSERVABLE.includes(id));
    if (!pick) continue;
    return { id: idOf(hash32(seed, t), "o"), species: pick.species, home: p, seed: hash32(seed, "ind", t), cell: cellOf(p), window, n: 300, ...(pick.variant ? { variant: pick.variant } : {}) };
  }
  return null;
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
  // Havsörnen sitter still (högt, på en trädtopp eller ett stenblock).
  if (sp.walkMps <= 0) return { pos, state: "rest", headingDeg: heading };
  const zoneOk = (p: LatLon) => !sp.needs?.waterZone || inWaterZone(sp, waterAt(env, p));
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
      const okTgt = Math.hypot(off.x + Math.sin(a) * dist, off.y + Math.cos(a) * dist) <= 80 && safeSegment(env, pos, tgt, SPAWN.maxFromWalkM) && zoneOk(tgt);
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
