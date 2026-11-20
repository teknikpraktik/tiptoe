// Mönster från teknikpraktik/solosurvival@033a121 src/play/session.ts: wake lock, visibilitychange, pagehide, frånvaro, ögonblicksbild.
// Matchlogiken är inte kopierad. Sessionen äger promenaden: GPS → filter → spår, motor, reservat, foton, lagring.
import { ratePhoto, type Rating } from "@/camera/rating";
import type { Placement } from "@/camera/projection";
import { MAX_PLAUSIBLE_SPEED_MPS } from "@/config/gps";
import { newEngineState, WorldEngine, type Animal, type EngineEvent } from "@/engine/engine";
import { scoreFrom, type ScoreSummary } from "@/engine/scoring";
import { SPECIES, type SpeciesId, type Tempo } from "@/engine/species";
import type { Environment } from "@/geo/environment";
import { bearingDeg, haversineM, type LatLon } from "@/geo/geometry";
import { clipper2Ts } from "@/geo/reserves/ops-clipper2-ts";
import { computeReserves, totalAreaM2, type Reserve, type TrackPoint } from "@/geo/reserves/reserves";
import { GpsFilter } from "@/gps/filters/filter";
import { GpsProvider, type GeoLike, type GpsErrorCode, type GpsEvent } from "@/gps/provider/provider";
import { canPhotograph as gpsPhotoOk, canTrack, type GpsQuality } from "@/gps/types";
import { HeadingTracker } from "@/sensors/heading";
import { SpeedTracker } from "@/sensors/speed";
import { currentTempo, StepDetector } from "@/sensors/tempo";
import { CHUNK_POINTS, type Observation, type Profile, type Repo, type WalkMeta } from "@/storage/repo";
import { FieldLog, loadLog } from "./fieldlog";

export interface MotionSource {
  /** iOS kräver en användargest: anropas från klicket som startar promenaden. */
  requestPermission(): Promise<"granted" | "denied" | "unsupported">;
  start(onSample: (mag: number, tMs: number) => void): void;
  stop(): void;
}

export interface SessionDeps {
  geo: GeoLike | undefined;
  repo: Repo | null;
  loadEnv: (center: LatLon, radiusM: number) => Promise<Environment | null>;
  motion?: MotionSource;
  wakeLock?: { request(): Promise<{ release(): Promise<void> } | null> };
  now?: () => number;
  newId?: () => string;
  onLog?: (event: string, data?: Record<string, unknown>) => void;
  /** För fältloggen. */
  build?: string;
  userAgent?: string;
  standalone?: boolean;
  /** navigator.storage.persist(): begärs när en promenad startar (spec: Lagring). */
  persist?: () => Promise<boolean>;
}

export interface AnimalView { id: string; species: SpeciesId; lat: number; lon: number; state: Animal["state"]; headingDeg: number; distM: number }

export interface ClosureView { id: number; ha: number; kind: "new" | "grew"; pieces: [number, number][][][]; atMs: number }

export interface WalkView {
  stage: "loading" | "idle" | "paused" | "walking";
  profile: Profile | null;
  walk: WalkMeta | null;
  pos: LatLon | null;
  accuracyM: number | null;
  quality: GpsQuality;
  headingDeg: number | null;
  tempo: Tempo;
  tempoSource: "motion" | "gps";
  gpsError: GpsErrorCode | null;
  track: LatLon[];
  reserves: Reserve[];
  totalAreaM2: number;
  lastClosure: ClosureView | null;
  animals: AnimalView[];
  /** Närmaste djur inom fotoavstånd (inte på flykt), och om kameran får användas just nu. */
  photoTarget: { id: string; ready: boolean; why: null | "move" | "gps" } | null;
  score: ScoreSummary;
  env: "none" | "loading" | "ok" | "missing";
  storage: "ok" | "none";
}

export interface PhotoResult { stars: Rating["stars"]; rating: Rating; points: number; newSpecies: boolean; species: SpeciesId; photoId: string; observation: Observation | null }

const ENV_RADIUS_M = 900;
const ENV_RELOAD_M = 500;
const TRACK_MIN_STEP_M = 5;
const RESERVE_EVERY_MS = 10_000;
const SNAPSHOT_EVERY_MS = 15_000;
const TICK_MS = 1000;

export class WalkSession {
  private listeners = new Set<() => void>();
  private view: WalkView;
  private nowFn: () => number;
  private readonly now = () => this.nowFn();
  private provider: GpsProvider;
  private filter = new GpsFilter({ maxPlausibleSpeedMps: MAX_PLAUSIBLE_SPEED_MPS });
  private heading = new HeadingTracker();
  private speed = new SpeedTracker();
  private steps: StepDetector | null = null;
  private engine: WorldEngine | null = null;
  private env: Environment | null = null;
  private envCenter: LatLon | null = null;
  private envLoading = false;
  private track: TrackPoint[] = [];
  private savedChunks = 0;
  private trackDirtySince = 0;
  private lastReserveMs = 0;
  private lastSnapMs = 0;
  private addedThisWalkM2 = 0;
  private observations: Observation[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lock: { release(): Promise<void> } | null = null;
  private hidden = false;
  private closureSeq = 0;

  constructor(private readonly d: SessionDeps) {
    this.nowFn = d.now ?? Date.now;
    this.provider = new GpsProvider(d.geo, () => this.now());
    this.view = {
      stage: "loading", profile: null, walk: null, pos: null, accuracyM: null, quality: "unavailable", headingDeg: null, tempo: "still", tempoSource: "gps", gpsError: null,
      track: [], reserves: [], totalAreaM2: 0, lastClosure: null, animals: [], photoTarget: null, score: scoreFrom([]), env: "none", storage: d.repo ? "ok" : "none",
    };
  }

  // ---------- extern butik (useSyncExternalStore) ----------
  subscribe = (f: () => void) => { this.listeners.add(f); return () => { this.listeners.delete(f); }; };
  getView = () => this.view;
  private set(patch: Partial<WalkView>) { this.view = { ...this.view, ...patch }; this.listeners.forEach((f) => f()); }
  private fieldLog: FieldLog | null = null;
  private log(event: string, data?: Record<string, unknown>) { this.d.onLog?.(event, data); this.fieldLog?.add(this.now(), event, data); }
  /** Fältloggen sparas direkt efter viktiga händelser (möte, flykt, foto, reservat, kamerafel), inte bara med ögonblicksbilden. */
  private saveLog() { const db = this.d.repo?.db; if (db && this.fieldLog) void this.fieldLog.save(db).catch(() => undefined); }
  /** Händelser från gränssnittet (t.ex. kamerafel) till fältloggen. */
  logEvent(event: string, data?: Record<string, unknown>): void { this.log(event, data); this.saveLog(); }
  /** Fältloggen för den pågående promenaden (för /field). */
  currentLog(): FieldLog | null { return this.fieldLog; }
  private id() { return this.d.newId?.() ?? `${this.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`; }

  /** Vid appstart: profil, sparade reservat och observationer, och en promenad som var igång när appen stängdes. */
  async init(lang: Profile["lang"]): Promise<void> {
    const repo = this.d.repo;
    if (!repo) { this.set({ stage: "idle" }); return; }
    const profile = await repo.ensureProfile(lang, this.now());
    const [reserves, observations, active] = await Promise.all([repo.reserves(profile.id), repo.observations(profile.id), repo.activeWalk(profile.id)]);
    this.observations = observations;
    const patch: Partial<WalkView> = { profile, reserves, totalAreaM2: totalAreaM2(reserves), score: scoreFrom(observations) };
    if (active) {
      this.track = await repo.track(profile.id, active.id);
      this.savedChunks = Math.ceil(this.track.length / CHUNK_POINTS);
      const snap = await repo.snapshot(profile.id, active.id);
      const saved = await loadLog(repo.db, active.id).catch(() => undefined);
      this.fieldLog = saved ? FieldLog.fromData(saved) : new FieldLog(active.id, this.now(), this.d.build ?? "dev", this.d.userAgent, this.d.standalone);
      if (snap) { this.addedThisWalkM2 = snap.addedThisWalkM2; this.engine = new WorldEngine(snap.engine, emptyEnv); }
      this.set({ ...patch, stage: "paused", walk: active, track: this.track.map(ll) });
      this.log("restore", { walk: active.id, points: this.track.length, snapshot: !!snap });
      return;
    }
    this.set({ ...patch, stage: "idle" });
  }

  /** Starta en ny promenad (eller fortsätt en pausad). Anropas från ett klick (iOS: rörelsesensorn kräver en gest). */
  async start(): Promise<void> {
    const motion = this.d.motion ? await this.d.motion.requestPermission().catch(() => "denied" as const) : "unsupported";
    this.log("motion_permission", { status: motion });
    if (this.d.persist) void this.d.persist().then((ok) => this.log("storage_persist", { granted: ok }), () => this.log("storage_persist", { granted: false }));
    const repo = this.d.repo, profile = this.view.profile;
    let walk = this.view.walk;
    if (!walk) {
      walk = { id: this.id(), profileId: profile?.id ?? "p1", startedAt: this.now(), endedAt: null, distanceM: 0, trackPoints: 0, photos: 0, points: 0, addedM2: 0 };
      this.track = []; this.savedChunks = 0; this.addedThisWalkM2 = 0;
      this.engine = new WorldEngine(newEngineState(this.now()), emptyEnv);
      this.fieldLog = new FieldLog(walk.id, this.now(), this.d.build ?? "dev", this.d.userAgent, this.d.standalone);
      await repo?.saveWalk(walk);
      this.log("walk_start", { walk: walk.id });
    } else this.log("walk_resume", { walk: walk.id });
    this.engine ??= new WorldEngine(newEngineState(this.now()), emptyEnv);
    this.set({ stage: "walking", walk, track: this.track.map(ll) });
    this.startSensors(motion === "granted");
    void this.acquireWakeLock();
  }

  async end(): Promise<void> {
    this.stopSensors();
    await this.releaseWakeLock();
    const w = this.view.walk, repo = this.d.repo, p = this.view.profile;
    if (w && repo && p) {
      await this.recomputeReserves(true);
      this.fieldLog?.summarize({ distanceM: Math.round(w.distanceM), trackPoints: this.track.length, addedM2: Math.round(this.addedThisWalkM2), points: w.points, durationS: Math.round((this.now() - w.startedAt) / 1000) });
      if (this.fieldLog) await this.fieldLog.save(repo.db).catch(() => undefined);
      const done = { ...w, endedAt: this.now(), trackPoints: this.track.length };
      await repo.saveWalk(done);
      await repo.deleteSnapshot(p.id, w.id);
      this.log("walk_end", { walk: w.id, points: this.track.length, addedM2: Math.round(this.addedThisWalkM2) });
    }
    this.engine = null;
    this.fieldLog = null;
    this.track = [];
    this.set({ stage: "idle", walk: null, track: [], animals: [], photoTarget: null, lastClosure: null });
  }

  // ---------- sensorer ----------
  private startSensors(motion: boolean) {
    if (motion && this.d.motion) { this.steps = new StepDetector(); this.d.motion.start((m, t) => this.steps?.push(m, t)); }
    this.provider.start((e) => this.onGps(e));
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  private stopSensors() {
    this.provider.stop();
    this.d.motion?.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** document.visibilitychange: allt som drar batteri vilar när sidan är dold. Motorn räknar ikapp vid återkomst. */
  onVisibility(hidden: boolean): void {
    this.hidden = hidden;
    if (this.view.stage !== "walking") return;
    if (hidden) {
      this.stopSensors();
      void this.saveSnapshot();
      void this.releaseWakeLock();
      this.log("hidden");
    } else {
      this.startSensors(!!this.steps);
      void this.acquireWakeLock();
      this.log("visible");
    }
  }

  onPageHide(): void { void this.saveSnapshot(); }

  private async acquireWakeLock() {
    if (this.lock || !this.d.wakeLock || this.hidden) return;
    try { this.lock = await this.d.wakeLock.request(); this.log("wakelock", { ok: !!this.lock }); } catch (e) { this.lock = null; this.log("wakelock", { ok: false, error: String(e) }); }
  }
  private async releaseWakeLock() {
    const l = this.lock; this.lock = null;
    try { await l?.release(); } catch { /* redan släppt */ }
  }

  /** För e2e och simulering: byt klocka (simulerad tid). */
  useClock(now: () => number): void { this.nowFn = now; }

  /** För e2e och simulering: mata en GPS-händelse direkt (samma väg som riktig GPS). */
  injectGps(e: GpsEvent): void { this.onGps(e); }

  private onGps(e: GpsEvent) {
    if (e.type === "error") { if (this.fieldLog) this.fieldLog.data.gps.errors++; this.set({ gpsError: e.code, quality: this.filter.qualityAt(this.now()) }); this.log("gps_error", { code: e.code }); return; }
    const out = this.filter.push(e.fix, e.receivedAtMs);
    this.fieldLog?.fix(e.receivedAtMs, out.verdict === "accepted" || out.verdict === "reacquired", out.verdict === "jump", e.fix.accuracyM);
    if (out.verdict === "reacquired") this.heading.rebase();
    if (out.verdict === "jump") this.log("gps_jump", { acc: e.fix.accuracyM });
    const pos = out.position;
    if (pos && (out.verdict === "accepted" || out.verdict === "reacquired")) {
      this.speed.push(pos, e.fix.timestampMs, e.fix.speedMps);
      this.heading.update({ pos, accuracyM: e.fix.accuracyM, gpsHeadingDeg: e.fix.headingDeg, gpsSpeedMps: e.fix.speedMps, tMs: e.fix.timestampMs });
      if (canTrack(out.quality)) this.appendTrack({ lat: pos.lat, lon: pos.lon, tMs: e.fix.timestampMs, accuracyM: e.fix.accuracyM });
    }
    this.set({ pos, accuracyM: e.fix.accuracyM, quality: out.quality, headingDeg: this.heading.heading, gpsError: null });
    this.tick(e.receivedAtMs);
  }

  private appendTrack(p: TrackPoint) {
    const last = this.track[this.track.length - 1];
    if (last && haversineM(last, p) < TRACK_MIN_STEP_M) return;
    this.track.push(p);
    if (!this.trackDirtySince) this.trackDirtySince = this.now();
    const w = this.view.walk, repo = this.d.repo;
    if (w && repo) {
      const seq = Math.floor((this.track.length - 1) / CHUNK_POINTS);
      void repo.saveChunk(w.profileId, w.id, seq, this.track.slice(seq * CHUNK_POINTS, seq * CHUNK_POINTS + CHUNK_POINTS));
      this.savedChunks = Math.max(this.savedChunks, seq + 1);
      if (last) w.distanceM += haversineM(last, p);
    }
    this.set({ track: this.track.map(ll) });
  }

  // ---------- motor, reservat, ögonblicksbild ----------
  private tick(tMs = this.now()) {
    if (this.view.stage !== "walking" || !this.engine) return;
    const pos = this.view.pos;
    const tempo = currentTempo(this.steps, tMs, this.speed.speedAt(tMs));
    if (pos && (!this.envCenter || haversineM(pos, this.envCenter) > ENV_RELOAD_M)) void this.loadEnv(pos);
    let events: EngineEvent[] = [];
    if (this.env) events = this.engine.step({ tMs, pos, tempo: tempo.tempo, posOk: pos !== null && this.view.quality !== "poor" && this.view.quality !== "unavailable" });
    for (const ev of events) this.log(`animal_${ev.type}`, ev as unknown as Record<string, unknown>);
    if (events.some((e) => e.type === "appear" || e.type === "flee")) this.saveLog();
    const animals: AnimalView[] = this.engine.visible(pos).map((a) => ({ id: a.id, species: a.species, lat: a.pos.lat, lon: a.pos.lon, state: a.state, headingDeg: a.headingDeg, distM: pos ? haversineM(pos, a.pos) : Infinity }));
    let photoTarget: WalkView["photoTarget"] = null;
    for (const a of animals) {
      if (a.state === "flee" || a.state === "gone" || a.distM > SPECIES[a.species].photoM) continue;
      if (!photoTarget || a.distM < (animals.find((x) => x.id === photoTarget!.id)?.distM ?? Infinity)) {
        const ready = tempo.tempo === "still" && gpsPhotoOk(this.view.quality);
        photoTarget = { id: a.id, ready, why: ready ? null : tempo.tempo !== "still" ? "move" : "gps" };
      }
    }
    this.set({ tempo: tempo.tempo, tempoSource: tempo.source, animals, photoTarget });
    if (this.trackDirtySince && tMs - this.lastReserveMs >= RESERVE_EVERY_MS) void this.recomputeReserves();
    if (tMs - this.lastSnapMs >= SNAPSHOT_EVERY_MS) void this.saveSnapshot();
  }

  private async loadEnv(center: LatLon) {
    if (this.envLoading) return;
    this.envLoading = true;
    this.set({ env: "loading" });
    try {
      const env = await this.d.loadEnv(center, ENV_RADIUS_M);
      if (env) { this.env = env; this.envCenter = center; this.engine?.setEnvironment(env); this.set({ env: "ok" }); this.log("env_loaded", { objects: env.size }); }
      else { this.envCenter = center; this.set({ env: "missing" }); this.log("env_missing"); }
    } finally { this.envLoading = false; }
  }

  private reserveBusy = false;
  private async recomputeReserves(force = false) {
    if (this.reserveBusy || (!force && !this.trackDirtySince)) return;
    this.lastReserveMs = this.now();
    this.trackDirtySince = 0;
    if (this.track.length < 3) return;
    this.reserveBusy = true;
    try {
      const t0 = performance.now();
      const r = computeReserves(clipper2Ts, { track: this.track, existing: this.view.reserves, nowMs: this.now(), newId: () => `r${this.id()}`, options: { addedThisWalkM2: this.addedThisWalkM2 } });
      const ms = Math.round(performance.now() - t0);
      if (r.capped.length) this.log("reserve_capped", { areasM2: r.capped.map(Math.round) });
      if (r.addedM2 <= 0) return;
      this.addedThisWalkM2 += r.addedM2;
      const w = this.view.walk;
      if (w) w.addedM2 = this.addedThisWalkM2;
      // Läget uppdateras innan något sparas, så att nästa beräkning alltid utgår från de nya reservaten.
      this.set({ reserves: r.reserves, totalAreaM2: totalAreaM2(r.reserves), lastClosure: { id: ++this.closureSeq, ha: r.addedM2 / 10_000, kind: r.grown.length ? "grew" : "new", pieces: r.newPieces, atMs: this.now() } });
      this.log("reserve_closed", { addedM2: Math.round(r.addedM2), created: r.created, grown: r.grown, merged: r.merged, ms, breaks: r.breaks.length });
      this.saveLog();
      const p = this.view.profile;
      if (p) await this.d.repo?.replaceReserves(p.id, r.reserves);
      if (w) await this.d.repo?.saveWalk(w);
    } finally {
      this.reserveBusy = false;
    }
  }

  private async saveSnapshot() {
    const w = this.view.walk, p = this.view.profile;
    if (!w || !p || !this.engine || !this.d.repo) return;
    this.lastSnapMs = this.now();
    await this.d.repo.saveSnapshot(p.id, { walkId: w.id, savedAt: this.now(), engine: this.engine.s, addedThisWalkM2: this.addedThisWalkM2 });
    await this.d.repo.saveWalk({ ...w, trackPoints: this.track.length });
    if (this.fieldLog) await this.fieldLog.save(this.d.repo.db).catch(() => undefined);
  }

  // ---------- foto ----------
  /** Kameran för ett djur: bäring, avstånd och tillstånd just nu. */
  cameraTarget(animalId: string): { bearingDeg: number; distM: number; headingDeg: number; species: SpeciesId; state: Animal["state"] } | null {
    const a = this.engine?.s.active.find((x) => x.id === animalId), pos = this.view.pos;
    if (!a || !pos) return null;
    return { bearingDeg: bearingDeg(pos, a.pos), distM: haversineM(pos, a.pos), headingDeg: a.headingDeg, species: a.species, state: a.state };
  }

  /** Ett taget foto: betyg, sparat foto, observation och poäng (första fotot av en individ). */
  async photo(animalId: string, shot: { blob: Blob; width: number; height: number; placement: Placement }): Promise<PhotoResult | null> {
    const a = this.engine?.s.active.find((x) => x.id === animalId), pos = this.view.pos, w = this.view.walk, p = this.view.profile;
    if (!a || !pos || !w || !p) return null;
    const sp = SPECIES[a.species];
    const distM = haversineM(pos, a.pos);
    const rating = ratePhoto({ distM, photoM: sp.photoM, placement: shot.placement, state: a.state === "alert" ? "alert" : a.state === "flee" ? "flee" : "calm" });
    const photoId = `ph${this.id()}`;
    await this.d.repo?.savePhoto({ id: photoId, createdAt: this.now(), blob: shot.blob, width: shot.width, height: shot.height, meta: { animalId, species: a.species, stars: rating.stars } });
    w.photos++;
    let observation: Observation | null = null, points = 0;
    const before = scoreFrom(this.observations);
    if (rating.stars > 0) {
      const already = this.observations.some((o) => o.animalId === a.id && o.stars > 0);
      points = already ? 0 : sp.points;
      observation = { id: `o${this.id()}`, profileId: p.id, walkId: w.id, animalId: a.id, species: a.species, photoId, stars: rating.stars as 1 | 2 | 3, points, distM: Math.round(distM), tMs: this.now(), lat: a.pos.lat, lon: a.pos.lon };
      this.observations.push(observation);
      await this.d.repo?.addObservation(observation);
      w.points += points;
    }
    await this.d.repo?.saveWalk(w);
    const score = scoreFrom(this.observations);
    this.set({ score, walk: { ...w } });
    const newSpecies = !before.species.includes(a.species) && score.species.includes(a.species);
    this.log("photo_rated", { animalId, species: a.species, stars: rating.stars, distM: Math.round(distM), points, newSpecies });
    this.saveLog();
    return { stars: rating.stars, rating, points, newSpecies, species: a.species, photoId, observation };
  }

  /** För fältdiagnostik och e2e. */
  debug() { return { engine: this.engine?.s ?? null, track: this.track.length, env: !!this.env, addedThisWalkM2: this.addedThisWalkM2 }; }
}

const ll = (p: TrackPoint): LatLon => ({ lat: p.lat, lon: p.lon });

/** Miljö innan tiles har lästs in: allt är spärrat, så inga djur kan dyka upp. */
const emptyEnv: Environment = { habitat: () => "open", blocked: () => true, segmentBlocked: () => true, hazard: () => true, walkableDistM: () => Infinity, waterDistM: () => Infinity, forestWithin: () => false, size: 0 };
