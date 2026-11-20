// Struktur och koncept från teknikpraktik/solosurvival@033a121 src/engine/core/engine.ts (fast tidssteg, seedad slump, händelser,
// serialiserbart tillstånd) och spawning/spawn.ts + ai/culling.ts (säker spawnplats, minsta avstånd, gallring av klumpar). Nytt innehåll.
import { fromLocal, haversineM, toLocal, type LatLon } from "@/geo/geometry";
import { safeSpot, type Environment, type Habitat } from "@/geo/environment";
import { rand } from "./core/rng";
import { BEHAVIOR, SPAWN } from "./config";
import { hash32 } from "./hash";
import { SPECIES, TEMPO_FACTOR, WATER_ZONE, type SpeciesId, type Tempo } from "./species";
import { candidates, cellsAround, idlePose, reserveCandidates, residentCandidate, windowOf, type Candidate, type Cell, type Resident } from "./world";
import { LevelIndex } from "./levels";

/** Profilens del av världen: reservatsnivåer och inflyttade djur (spec: per profil). */
export interface ProfileWorld { key: string; levels: LevelIndex; residents: Resident[] }
export type AppearVia = "base" | "reserve" | "resident" | "observation" | "moved_in";

/** Hur länge (ms) en fågel syns lyfta innan den är borta. */
const FLY_MS = 1500;

export type AnimalState = "rest" | "graze" | "wander" | "alert" | "flee" | "gone";
/** fled = sprang iväg, dove = dök undan i vattnet, flew = lyfte, left = gick sin väg, far = för långt bort. */
export type GoneReason = "fled" | "dove" | "flew" | "left" | "far";

export interface Animal {
  id: string;
  species: SpeciesId;
  seed: number;
  cell: Cell;
  window: number;
  n: number;
  variant?: string;
  home: LatLon;
  pos: LatLon;
  headingDeg: number;
  state: AnimalState;
  /** Oro 0–1 (1 = flyr). */
  alarm: number;
  /** Störd: följer inte längre den delade tomgångsbanan. */
  disturbed: boolean;
  appearedAtMs: number;
  flee?: { target: LatLon; leftM: number; kind: "run" | "dive" | "fly"; untilMs?: number };
  goneAtMs?: number;
  goneReason?: GoneReason;
}

export interface EngineState {
  version: 1;
  tMs: number;
  budget: number;
  lastPos: LatLon | null;
  lastPosMs?: number;
  metersWalked: number;
  active: Animal[];
  /** Individer som redan dykt upp för den här profilen (id → fönster), så att de inte dyker upp igen i samma fönster. */
  used: Record<string, number>;
  encounters: number;
  /** Aktuella observationer (spec: sällsynt observation i närheten): kan aktiveras som vanliga kandidater tills de går ut. */
  observations?: { c: Candidate; untilMs: number }[];
}

export type EngineEvent =
  | { type: "appear"; id: string; species: SpeciesId; distM: number; habitat: Habitat; tMs: number; via: AppearVia }
  | { type: "alert"; id: string; tMs: number }
  | { type: "calm"; id: string; tMs: number }
  | { type: "flee"; id: string; distM: number; tempo: Tempo; tMs: number }
  | { type: "gone"; id: string; reason: GoneReason; tMs: number };

export interface StepInput {
  tMs: number;
  /** Filtrerad position (aldrig rå GPS), eller null. */
  pos: LatLon | null;
  tempo: Tempo;
  /** Position som duger för spelet (GPS-kvalitet bättre än "poor"). */
  posOk: boolean;
}

export function newEngineState(tMs: number): EngineState {
  return { version: 1, tMs, budget: 0.6, lastPos: null, metersWalked: 0, active: [], used: {}, encounters: 0 };
}

const NATURE: Habitat[] = ["forest", "wetland", "park", "grass", "field"];
export const metersPerEncounter = (h: Habitat) => (NATURE.includes(h) ? SPAWN.metersPerEncounter.nature : h === "urban" ? SPAWN.metersPerEncounter.urban : SPAWN.metersPerEncounter.mixed);

/**
 * Världsmotorn för en profil under en promenad. Ren TypeScript, körbar i Node. All slump kommer ur individernas seed (delad värld) eller ur
 * motorns tillstånd; samma indata ger samma utdata.
 */
export class WorldEngine {
  private candCache = new Map<string, Candidate[]>();
  private profile: ProfileWorld = { key: "", levels: new LevelIndex([]), residents: [] };
  constructor(public s: EngineState, private env: Environment, profile?: ProfileWorld) { if (profile) this.profile = profile; }

  /** Nya reservat eller inflyttade: byggs om av sessionen när de ändras. */
  setProfileWorld(p: ProfileWorld): void { this.profile = p; this.candCache.clear(); }
  get levels(): LevelIndex { return this.profile.levels; }

  /** Ett djur dyker upp direkt, utan budget (inflyttning när en slinga sluts: garanterat möte). */
  forceAppear(c: Candidate, tMs: number, player: LatLon | null, via: AppearVia = "moved_in"): EngineEvent {
    const pose = idlePose(c, tMs, this.env);
    this.s.used[c.id] = c.window;
    this.s.encounters++;
    this.s.active.push(this.animalFrom(c, pose, tMs));
    return { type: "appear", id: c.id, species: c.species, distM: player ? Math.round(haversineM(pose.pos, player)) : 0, habitat: this.env.habitat(pose.pos), tMs, via };
  }

  /** En observation: kandidaten kan aktiveras som andra (inom räckhåll, med budget) fram till `untilMs`. */
  addObservation(c: Candidate, untilMs: number): void { (this.s.observations ??= []).push({ c, untilMs }); }

  private animalFrom(c: Candidate, pose: ReturnType<typeof idlePose>, tMs: number): Animal {
    return { id: c.id, species: c.species, seed: c.seed, cell: c.cell, window: c.window, n: c.n, ...(c.variant ? { variant: c.variant } : {}), home: c.home, pos: pose.pos, headingDeg: pose.headingDeg, state: pose.state, alarm: 0, disturbed: false, appearedAtMs: tMs };
  }

  setEnvironment(env: Environment): void { this.env = env; this.candCache.clear(); }

  /** Avancera till `in.tMs` i fasta steg. Returnerar händelserna. */
  step(input: StepInput): EngineEvent[] {
    const ev: EngineEvent[] = [];
    // Sträckan driver budgeten (inte tiden): stillastående och för hög fart ger ingenting.
    // `lastPos` är ett ankare: sträckan räknas först när spelaren flyttat sig `budgetStepM` från det, och bara när rörelsesensorn säger att
    // spelaren rör sig. Darr i GPS:en när man står still ger alltså ingenting.
    if (input.pos && input.posOk) {
      if (!this.s.lastPos) { this.s.lastPos = input.pos; this.s.lastPosMs = input.tMs; }
      const d = haversineM(this.s.lastPos, input.pos);
      if (d >= SPAWN.budgetStepM) {
        const dt = Math.max(0.001, (input.tMs - (this.s.lastPosMs ?? input.tMs)) / 1000);
        if (input.tempo !== "still" && d / dt <= SPAWN.maxBudgetSpeedMps && d < 200) {
          this.s.metersWalked += d;
          this.s.budget = Math.min(SPAWN.maxBudget, this.s.budget + d / metersPerEncounter(this.env.habitat(input.pos)));
        }
        this.s.lastPos = input.pos;
        this.s.lastPosMs = input.tMs;
      }
    }
    // Fast tidssteg för beteendet; långa avbrott (appen i bakgrunden) räknas inte steg för steg.
    const stepMs = BEHAVIOR.stepS * 1000;
    let t = this.s.tMs;
    const target = input.tMs;
    if (target - t > 120_000) t = target - 120_000;
    while (t + stepMs <= target) {
      t += stepMs;
      this.behave(t, input, ev);
    }
    this.s.tMs = Math.max(this.s.tMs, t);
    if (input.pos && input.posOk) this.spawn(input.tMs, input.pos, ev);
    this.prune(input.tMs);
    return ev;
  }

  /** Djuret går att fotografera: inom fotoavstånd, inte på flykt, och spelaren står still. */
  canPhotograph(a: Animal, player: LatLon, tempo: Tempo): boolean {
    return (a.state !== "flee" && a.state !== "gone") && tempo === "still" && haversineM(a.pos, player) <= SPECIES[a.species].photoM;
  }

  /** Djur som syns på kartan. */
  visible(player: LatLon | null): Animal[] {
    return this.s.active.filter((a) => a.state !== "gone" && (!player || haversineM(a.pos, player) <= BEHAVIOR.visibleM));
  }

  // ---------- spawn ----------

  private candidatesFor(c: Cell, window: number): Candidate[] {
    const k = `${c.row},${c.col},${window}`;
    let v = this.candCache.get(k);
    if (!v) { v = candidates(c, window, this.env); this.candCache.set(k, v); if (this.candCache.size > 400) this.candCache.delete(this.candCache.keys().next().value!); }
    return v;
  }

  private spawn(tMs: number, player: LatLon, ev: EngineEvent[]): void {
    if (this.s.budget < 1) return;
    const live = this.s.active.filter((a) => a.state !== "gone");
    if (live.length >= SPAWN.maxActive) return;
    const w = windowOf(tMs);
    const eligible: { c: Candidate; pos: LatLon; d: number; key: number; via: AppearVia }[] = [];
    const pool: { c: Candidate; via: AppearVia }[] = [];
    for (const cell of cellsAround(player, SPAWN.maxDistM)) {
      for (const c of this.candidatesFor(cell, w)) pool.push({ c, via: "base" });
      if (!this.profile.levels.empty) for (const c of this.reserveFor(cell, w)) pool.push({ c, via: "reserve" });
    }
    for (const r of this.profile.residents) if (haversineM(r.home, player) <= SPAWN.maxDistM + 120) pool.push({ c: residentCandidate(r, w), via: "resident" });
    for (const o of this.s.observations ?? []) if (o.untilMs > tMs) pool.push({ c: o.c, via: "observation" });
    {
      for (const { c, via } of pool) {
        if (this.s.used[c.id] !== undefined) continue;
        const pose = idlePose(c, tMs, this.env);
        const d = haversineM(pose.pos, player);
        if (d < SPAWN.minDistM || d > SPAWN.maxDistM) continue;
        if (live.some((a) => haversineM(a.pos, pose.pos) < SPAWN.minSpacingM)) continue;
        // Deterministisk men spridd ordning: samma val på två telefoner på samma plats.
        // Inflyttade och observerade djur går före: de är skälet att gå dit.
        eligible.push({ c, pos: pose.pos, d, key: via === "resident" || via === "observation" ? 0 : hash32(c.id, "pick"), via });
      }
    }
    if (!eligible.length) return;
    eligible.sort((a, b) => a.key - b.key || (a.c.id < b.c.id ? -1 : 1));
    const { c, d, via } = eligible[0];
    const pose = idlePose(c, tMs, this.env);
    this.s.budget -= 1;
    this.s.used[c.id] = c.window;
    this.s.encounters++;
    if (via === "observation") this.s.observations = (this.s.observations ?? []).filter((o) => o.c.id !== c.id);
    this.s.active.push(this.animalFrom(c, pose, tMs));
    ev.push({ type: "appear", id: c.id, species: c.species, distM: Math.round(d), habitat: this.env.habitat(player), tMs, via });
  }

  private reserveFor(c: Cell, window: number): Candidate[] {
    const k = `r${c.row},${c.col},${window}`;
    let v = this.candCache.get(k);
    if (!v) { v = reserveCandidates(c, window, this.env, this.profile.key, this.profile.levels); this.candCache.set(k, v); }
    return v;
  }

  private prune(tMs: number): void {
    const w = windowOf(tMs);
    if (this.s.observations) this.s.observations = this.s.observations.filter((o) => o.untilMs > tMs);
    for (const [id, win] of Object.entries(this.s.used)) if (win < w - 1) delete this.s.used[id];
    this.s.active = this.s.active.filter((a) => a.state !== "gone" || tMs - (a.goneAtMs ?? tMs) < 5000);
  }

  // ---------- beteende ----------

  private behave(t: number, input: StepInput, ev: EngineEvent[]): void {
    const dt = BEHAVIOR.stepS;
    const player = input.pos;
    for (const a of this.s.active) {
      if (a.state === "gone") continue;
      const sp = SPECIES[a.species];
      const d = player ? haversineM(a.pos, player) : Infinity;
      if (d > SPAWN.dropDistM) { this.gone(a, t, "far", ev); continue; }
      if (a.state === "flee") { this.fleeStep(a, dt, t, ev); continue; }
      // Oro: växer med närhet och spelarens tempo, avtar annars. GPS-brus påverkar inte tempot (det kommer från rörelsesensorn).
      const R = sp.detectionM * TEMPO_FACTOR[input.tempo];
      if (player && input.posOk && d < R) a.alarm += BEHAVIOR.alarmRate * (1 - d / R) * BEHAVIOR.tempoAlarm[input.tempo] * (0.5 + sp.skittish) * dt;
      else a.alarm = Math.max(0, a.alarm - BEHAVIOR.alarmDecay * dt);
      if (a.alarm >= 1 && player) { this.startFlee(a, player, t, input.tempo, d, ev); continue; }
      if (a.alarm >= BEHAVIOR.alertAt) {
        if (a.state !== "alert") { a.state = "alert"; a.disturbed = true; ev.push({ type: "alert", id: a.id, tMs: t }); }
        if (player) { const v = toLocal(a.pos, player); a.headingDeg = ((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360; }
        continue;
      }
      if (a.state === "alert") { a.state = "graze"; ev.push({ type: "calm", id: a.id, tMs: t }); }
      // Ostört djur följer den delade tomgångsbanan; ett stört stannar där det är och betar.
      if (!a.disturbed) {
        const p = idlePose({ id: a.id, species: a.species, home: a.home, seed: a.seed, cell: a.cell, window: a.window, n: a.n, variant: a.variant }, t, this.env);
        a.pos = p.pos; a.state = p.state; a.headingDeg = p.headingDeg;
        if ((t - a.appearedAtMs) / 1000 > sp.lifetimeS && d > sp.photoM * 1.5) this.gone(a, t, "left", ev);
      } else a.state = "graze";
    }
  }

  private startFlee(a: Animal, player: LatLon, t: number, tempo: Tempo, d: number, ev: EngineEvent[]): void {
    const sp = SPECIES[a.species];
    a.state = "flee";
    a.disturbed = true;
    ev.push({ type: "flee", id: a.id, distM: Math.round(d), tempo, tMs: t });
    if (sp.escape === "fly") {
      // Lyftet är en animation i gränssnittet, ingen rörelse över vatten eller land.
      a.flee = { target: a.pos, leftM: 0, kind: "fly", untilMs: t + FLY_MS };
      return;
    }
    const r = { rngState: hash32(a.seed, "flee", Math.floor(t / 1000)) };
    if (sp.escape === "dive") {
      // Utter och bäver: mot närmaste större vatten, och borta vid zonens inre gräns (spec: dyker undan). Aldrig ut på vattnet.
      const area = sp.needs?.waterAreaM2 ?? WATER_ZONE.defaultAreaM2;
      let best: { p: LatLon; w: number } | null = null;
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * 2 * Math.PI;
        const p = fromLocal(a.pos, { x: Math.sin(ang) * 25, y: Math.cos(ang) * 25 });
        if (this.env.blocked(p) || this.env.hazard(p)) continue;
        const w = this.env.waterDistM(p, WATER_ZONE.maxM + 30, area);
        if (!best || w < best.w) best = { p, w };
      }
      a.flee = { target: best?.p ?? a.pos, leftM: best ? 25 : 0, kind: "dive" };
      return;
    }
    const away = toLocal(player, a.pos);
    const base = Math.atan2(away.x, away.y);
    const [f0, f1] = BEHAVIOR.fleeDistM;
    const dist = f0 + (f1 - f0) * rand(r);
    // Bort från spelaren, viktat mot skydd (skog) och bort från spärrade ytor och faror.
    let best: { p: LatLon; score: number } | null = null;
    for (const offDeg of [0, -30, 30, -60, 60, -90, 90]) {
      const ang = base + (offDeg * Math.PI) / 180;
      const p = fromLocal(a.pos, { x: Math.sin(ang) * dist, y: Math.cos(ang) * dist });
      if (!safeSpot(this.env, p, SPAWN.maxFromWalkM)) continue;
      const score = Math.cos((offDeg * Math.PI) / 180) + (this.env.forestWithin(p, 15) ? 0.6 : 0) + rand(r) * 0.1;
      if (!best || score > best.score) best = { p, score };
    }
    a.flee = { target: best?.p ?? a.pos, leftM: best ? dist : 0, kind: "run" };
  }

  private fleeStep(a: Animal, dt: number, t: number, ev: EngineEvent[]): void {
    const f = a.flee;
    if (f?.kind === "fly") { if (t >= (f.untilMs ?? t)) this.gone(a, t, "flew", ev); return; }
    const reason: GoneReason = f?.kind === "dive" ? "dove" : "fled";
    if (!f || f.leftM <= 0) { this.gone(a, t, reason, ev); return; }
    const sp = SPECIES[a.species];
    if (f.kind === "dive" && this.env.waterDistM(a.pos, WATER_ZONE.minM, sp.needs?.waterAreaM2 ?? WATER_ZONE.defaultAreaM2) <= WATER_ZONE.minM) { this.gone(a, t, "dove", ev); return; }
    const v = toLocal(a.pos, f.target);
    const len = Math.hypot(v.x, v.y);
    const step = Math.min(len, sp.fleeMps * dt);
    if (len < 0.5) { this.gone(a, t, reason, ev); return; }
    const next = fromLocal(a.pos, { x: (v.x / len) * step, y: (v.y / len) * step });
    // Aldrig in i byggnad, vatten eller över större väg: hellre försvinna (in i buskarna) än att springa dit.
    if (this.env.segmentBlocked(a.pos, next) || this.env.hazard(next)) { this.gone(a, t, reason, ev); return; }
    a.headingDeg = ((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360;
    a.pos = next;
    f.leftM -= step;
  }

  private gone(a: Animal, t: number, reason: GoneReason, ev: EngineEvent[]): void {
    a.state = "gone";
    a.goneAtMs = t;
    a.goneReason = reason;
    ev.push({ type: "gone", id: a.id, reason, tMs: t });
  }
}
