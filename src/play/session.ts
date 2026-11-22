// Mönster från teknikpraktik/solosurvival@033a121 src/play/session.ts: wake lock, visibilitychange, pagehide, frånvaro, ögonblicksbild.
// Matchlogiken är inte kopierad. Sessionen äger promenaden: GPS → filter → spår, motor, reservat, foton, lagring.
import { ratePhoto, type Rating } from "@/camera/rating";
import type { Placement } from "@/camera/projection";
import { MAX_PLAUSIBLE_SPEED_MPS } from "@/config/gps";
import { newEngineState, WorldEngine, type Animal, type EngineEvent } from "@/engine/engine";
import { hash32 } from "@/engine/hash";
import { LevelIndex, levelForArea, toNextLevelM2, type Level } from "@/engine/levels";
import { OBSERVATION, chooseResident, planObservation, residentCandidate, windowOf, type Resident } from "@/engine/world";
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
import { titleFor, type TitleId } from "@/engine/progress";
import { SoundDirector, ambienceFor, type Ambience, type SoundCue } from "@/audio/director";

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
  /** Ljud (spec: UX → Ljud): närhet, frys-varning, flykt, inflyttning och ambient. Utelämnat = tyst (Node, tester). */
  onSound?: (c: SoundCue) => void;
  onAmbience?: (a: Ambience) => void;
  /** navigator.storage.persist(): begärs när en promenad startar (spec: Lagring). */
  persist?: () => Promise<boolean>;
}

export interface AnimalView { id: string; species: SpeciesId; lat: number; lon: number; state: Animal["state"]; headingDeg: number; distM: number; look?: "warn" | "look" }

export interface ClosureView { id: number; ha: number; kind: "new" | "grew"; pieces: [number, number][][][]; atMs: number }

export interface WalkView {
  stage: "loading" | "idle" | "paused" | "walking";
  profile: Profile | null;
  profiles: Profile[];
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
  /** Kort meddelande till spelaren (inflyttning, ny nivå, observation). `id` ändras för varje nytt. */
  notice: { id: number; key: NoticeKey; vars: Record<string, string | number> } | null;
  /** Reservatet spelaren står i: nivå och vad som krävs för nästa (spec: kartan visar nivån och nästa mål). */
  levelInfo: { level: Level; areaM2: number; toNextM2: number | null } | null;
  /** Annonserade observationer (ungefärlig plats). */
  sightings: { id: string; species: SpeciesId; lat: number; lon: number; untilMs: number }[];
  /** Spår mot djur som ännu inte syns. */
  trails: { id: string; points: LatLon[] }[];
  /** Ett djur i närheten förvarnar eller tittar: spelaren ska frysa. */
  freeze: "warn" | "look" | null;
  animals: AnimalView[];
  /** Närmaste djur inom fotoavstånd (inte på flykt), och om kameran får användas just nu. */
  photoTarget: { id: string; ready: boolean; why: null | "move" | "gps" } | null;
  score: ScoreSummary;
  env: "none" | "loading" | "ok" | "missing";
  storage: "ok" | "none";
}

export type NoticeKey = "walk.movedIn" | "walk.levelUp" | "walk.levelSpecies" | "walk.observation" | "walk.lookUp";

/** Påminnelse att titta upp (spec: Säkerhet för barn): efter så här länge i rörelse, högst så här ofta. */
export const LOOK_UP = { afterMs: 120_000, everyMs: 300_000 } as const;

/** Väderstreck för en bäring (för observationer). */
export const compassPoint = (deg: number): "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" => (["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const)[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export interface PhotoResult { stars: Rating["stars"]; rating: Rating; points: number; newSpecies: boolean; species: SpeciesId; variant?: string; photoId: string; observation: Observation | null; newTitle: TitleId | null }

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
  private noticeSeq = 0;
  private sound = new SoundDirector();
  private ambience: Ambience = "none";
  private setAmbience(a: Ambience) { if (a !== this.ambience) { this.ambience = a; this.d.onAmbience?.(a); } }
  private playSound(c: SoundCue) { this.d.onSound?.(c); this.log("sound", { kind: c.kind, pan: Math.round(c.pan * 100) / 100, gain: Math.round(c.gain * 100) / 100 }); }
  private residents: Resident[] = [];
  private notify(key: NoticeKey, vars: Record<string, string | number>) { this.set({ notice: { id: ++this.noticeSeq, key, vars } }); }
  /** Profilens värld till motorn: nivåer ur reservaten och de inflyttade. */
  private syncProfileWorld(reserves = this.view.reserves) {
    this.engine?.setProfileWorld({ key: this.view.profile?.id ?? "p1", levels: new LevelIndex(reserves), residents: this.residents });
  }

  constructor(private readonly d: SessionDeps) {
    this.nowFn = d.now ?? Date.now;
    this.provider = new GpsProvider(d.geo, () => this.now());
    this.view = {
      stage: "loading", profile: null, profiles: [], walk: null, pos: null, accuracyM: null, quality: "unavailable", headingDeg: null, tempo: "still", tempoSource: "gps", gpsError: null,
      track: [], reserves: [], totalAreaM2: 0, lastClosure: null, notice: null, levelInfo: null, sightings: [], trails: [], freeze: null, animals: [], photoTarget: null, score: scoreFrom([]), env: "none", storage: d.repo ? "ok" : "none",
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
    await this.loadProfile(profile);
  }

  /** Läser in en profils data (reservat, observationer, inflyttade, en pausad promenad). */
  private async loadProfile(profile: Profile): Promise<void> {
    const repo = this.d.repo!;
    this.engine = null; this.track = []; this.fieldLog = null; this.addedThisWalkM2 = 0;
    const profiles = (await repo.profiles()).sort((a, b) => a.createdAt - b.createdAt);
    const [reserves, observations, active, residents] = await Promise.all([repo.reserves(profile.id), repo.observations(profile.id), repo.activeWalk(profile.id), repo.residents(profile.id)]);
    this.observations = observations;
    this.residents = residents;
    const patch: Partial<WalkView> = { profile, profiles, reserves, totalAreaM2: totalAreaM2(reserves), score: scoreFrom(observations), sightings: [], trails: [], animals: [], lastClosure: null, levelInfo: null };
    if (active) {
      this.track = await repo.track(profile.id, active.id);
      this.savedChunks = Math.ceil(this.track.length / CHUNK_POINTS);
      const snap = await repo.snapshot(profile.id, active.id);
      const saved = await loadLog(repo.db, active.id).catch(() => undefined);
      this.fieldLog = saved ? FieldLog.fromData(saved) : new FieldLog(active.id, this.now(), this.d.build ?? "dev", this.d.userAgent, this.d.standalone);
      if (snap) { this.addedThisWalkM2 = snap.addedThisWalkM2; this.engine = new WorldEngine(snap.engine, emptyEnv); this.syncProfileWorld(reserves); }
      this.set({ ...patch, stage: "paused", walk: active, track: this.track.map(ll) });
      this.log("restore", { walk: active.id, points: this.track.length, snapshot: !!snap });
      return;
    }
    this.set({ ...patch, stage: "idle", walk: null, track: [] });
  }

  // ---------- profiler (spec: flera lokala profiler per telefon) ----------
  /**
   * Pausa en pågående promenad: sensorerna stängs och läget sparas (ögonblicksbild, spår, fältlogg). Promenaden ligger kvar som aktiv för
   * profilen och återupptas därifrån (samma väg som efter en omstart av appen).
   */
  async pause(): Promise<void> {
    if (this.view.stage !== "walking") return;
    this.stopSensors();
    this.setAmbience("none");
    this.sound.reset();
    await this.releaseWakeLock();
    await this.saveSnapshot();
    const w = this.view.walk, repo = this.d.repo;
    if (w && repo) await repo.saveWalk({ ...w, trackPoints: this.track.length });
    if (this.fieldLog && repo) await this.fieldLog.save(repo.db).catch(() => undefined);
    this.log("walk_pause", { walk: w?.id });
    this.set({ stage: "paused", animals: [], photoTarget: null, freeze: null });
  }
  private canChangeProfile() { return !!this.d.repo; }
  /** Byt profil. En pågående promenad pausas och sparas först; den fortsätter när man byter tillbaka. */
  async switchProfile(id: string): Promise<boolean> {
    const repo = this.d.repo;
    if (!repo || !this.canChangeProfile()) return false;
    if (id === this.view.profile?.id) return true;
    await this.pause();
    const p = (await repo.profiles()).find((x) => x.id === id);
    if (!p) return false;
    await repo.setActiveProfile(id);
    await this.loadProfile(p);
    this.log("profile_switch", { id });
    return true;
  }
  async createProfile(name: string, kind: Profile["kind"], lang: Profile["lang"]): Promise<Profile | null> {
    const repo = this.d.repo;
    if (!repo || !this.canChangeProfile()) return null;
    const p = await repo.createProfile(name, kind, lang, this.now());
    await this.switchProfile(p.id);
    return p;
  }
  async updateProfile(patch: Partial<Pick<Profile, "name" | "kind" | "lang">>): Promise<void> {
    const repo = this.d.repo, p = this.view.profile;
    if (!repo || !p) return;
    const np = { ...p, ...patch };
    await repo.saveProfile(np);
    this.set({ profile: np, profiles: this.view.profiles.map((x) => (x.id === np.id ? np : x)) });
  }
  async deleteProfile(id: string): Promise<boolean> {
    const repo = this.d.repo;
    if (!repo || !this.canChangeProfile() || this.view.profiles.length <= 1) return false;
    const wasActive = id === this.view.profile?.id;
    if (wasActive) await this.pause();
    await repo.deleteProfile(id);
    // En annan profil raderas: den aktiva (och en pågående promenad) påverkas inte.
    if (!wasActive) { this.set({ profiles: (await repo.profiles()).sort((a, b) => a.createdAt - b.createdAt) }); return true; }
    const next = await repo.ensureProfile(this.view.profile?.lang ?? "sv", this.now());
    await repo.setActiveProfile(next.id);
    await this.loadProfile(next);
    return true;
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
    this.syncProfileWorld();
    this.obsKm = Math.floor(this.engine.s.metersWalked / OBSERVATION.everyM);
    this.set({ stage: "walking", walk, track: this.track.map(ll) });
    this.startSensors(motion === "granted");
    void this.acquireWakeLock();
  }

  async end(): Promise<void> {
    this.stopSensors();
    this.setAmbience("none");
    this.sound.reset();
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
      this.setAmbience("none");
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
    if (this.env) events = this.engine.step({ tMs, pos, tempo: tempo.tempo, tempoFromMotion: tempo.source === "motion", posOk: pos !== null && this.view.quality !== "poor" && this.view.quality !== "unavailable" });
    this.lookUpReminder(tempo.tempo, tMs);
    for (const ev of events) this.log(`animal_${ev.type}`, ev as unknown as Record<string, unknown>);
    if (pos && this.env) this.maybeObservation(pos, tMs);
    if (this.d.onSound || this.d.onAmbience) {
      const heard = this.engine.s.active.map((a) => ({ id: a.id, species: a.species, pos: a.pos, gone: a.state === "gone" }));
      for (const c of this.sound.update({ tMs, player: pos, headingDeg: this.heading.heading, animals: heard, events })) this.playSound(c);
      if (pos && this.env) this.setAmbience(ambienceFor(this.env.habitat(pos), this.env.waterDistM(pos, 61, 2000)));
    }
    const inRes = pos ? this.engine.levels.reserveAt(pos) : null;
    const levelInfo = inRes ? { level: levelForArea(inRes.areaM2), areaM2: inRes.areaM2, toNextM2: toNextLevelM2(inRes.areaM2) } : null;
    if (JSON.stringify(levelInfo) !== JSON.stringify(this.view.levelInfo)) this.set({ levelInfo });
    if (events.some((e) => e.type === "appear" || e.type === "flee")) this.saveLog();
    const animals: AnimalView[] = this.engine.visible(pos).map((a) => ({ id: a.id, species: a.species, lat: a.pos.lat, lon: a.pos.lon, state: a.state, headingDeg: a.headingDeg, distM: pos ? haversineM(pos, a.pos) : Infinity, ...(a.look ? { look: a.look.phase } : {}) }));
    const freeze = animals.some((a) => a.look === "look") ? "look" : animals.some((a) => a.look === "warn") ? "warn" : null;
    let photoTarget: WalkView["photoTarget"] = null;
    for (const a of animals) {
      if (a.state === "flee" || a.state === "gone" || a.distM > SPECIES[a.species].photoM) continue;
      if (!photoTarget || a.distM < (animals.find((x) => x.id === photoTarget!.id)?.distM ?? Infinity)) {
        const ready = tempo.tempo === "still" && gpsPhotoOk(this.view.quality);
        photoTarget = { id: a.id, ready, why: ready ? null : tempo.tempo !== "still" ? "move" : "gps" };
      }
    }
    this.set({ tempo: tempo.tempo, tempoSource: tempo.source, animals, photoTarget, freeze, trails: this.engine.trails(pos) });
    if (this.trackDirtySince && tMs - this.lastReserveMs >= RESERVE_EVERY_MS) void this.recomputeReserves();
    if (tMs - this.lastSnapMs >= SNAPSHOT_EVERY_MS) void this.saveSnapshot();
  }

  private async loadEnv(center: LatLon) {
    if (this.envLoading) return;
    this.envLoading = true;
    this.set({ env: "loading" });
    try {
      const env = await this.d.loadEnv(center, ENV_RADIUS_M);
      if (env) {
        this.env = env; this.envCenter = center; this.engine?.setEnvironment(env); this.set({ env: "ok" }); this.log("env_loaded", { objects: env.size });
        const pc = this.pendingClosure;
        this.pendingClosure = null;
        if (pc) await this.afterClosure(pc.before, this.view.reserves, pc.pieces);
      }
      else { this.envCenter = center; this.set({ env: "missing" }); this.log("env_missing"); }
    } finally { this.envLoading = false; }
  }

  private movingSince: number | null = null;
  private lastLookUp = -Infinity;
  /** Titta upp: efter 2 minuter i gång- eller springtempo (med appen öppen), högst var 5:e minut. */
  private lookUpReminder(tempo: Tempo, t: number) {
    if (tempo !== "walk" && tempo !== "run") { this.movingSince = null; return; }
    this.movingSince ??= t;
    if (t - this.movingSince >= LOOK_UP.afterMs && t - this.lastLookUp >= LOOK_UP.everyMs) {
      this.lastLookUp = t;
      this.movingSince = t;
      this.notify("walk.lookUp", {});
      this.log("look_up");
    }
  }

  private obsKm = 0;
  /** Observationer: efter varje 1,5 km gången sträcka, med en chans (deterministisk), en sällsynt art annonseras i närheten. */
  private maybeObservation(pos: LatLon, tMs: number) {
    const km = Math.floor((this.engine?.s.metersWalked ?? 0) / OBSERVATION.everyM);
    if (km <= this.obsKm || !this.engine || !this.env) return;
    this.obsKm = km;
    const c = planObservation(this.env, pos, this.view.profile?.id ?? "p1", tMs, km);
    if (!c) return;
    this.engine.addObservation(c, tMs + OBSERVATION.durationMs);
    const dist = haversineM(pos, c.home);
    this.set({ sightings: [...this.view.sightings.filter((x) => x.untilMs > tMs), { id: c.id, species: c.species, lat: c.home.lat, lon: c.home.lon, untilMs: tMs + OBSERVATION.durationMs }] });
    this.notify("walk.observation", { species: c.species, dir: compassPoint(bearingDeg(pos, c.home)), m: Math.round(dist / 50) * 50 });
    this.log("observation", { id: c.id, species: c.species, distM: Math.round(dist) });
  }

  /**
   * Efter att en slinga slutits (spec: Direkt återkoppling och Reservatsnivåer): en individ flyttar in i den nya ytan med ett garanterat möte,
   * och ett reservat som når nivå 2 eller 3 får en sällsynt respektive mycket sällsynt invånare om miljön passar.
   */
  private pendingClosure: { before: Reserve[]; after: Reserve[]; pieces: [number, number][][][] } | null = null;
  private async afterClosure(before: Reserve[], after: Reserve[], pieces: [number, number][][][]) {
    const env = this.env, p = this.view.profile, pos = this.view.pos;
    // Terrängen är inte inläst än: inflyttningen görs när den är det.
    if (!env) { this.pendingClosure = { before, after, pieces: [...(this.pendingClosure?.pieces ?? []), ...pieces] }; return; }
    if (!p || !this.engine) return;
    const t = this.now();
    const levels = new LevelIndex(after);
    const added: Resident[] = [];
    const piece = [...pieces].sort((a, b) => areaOf(b) - areaOf(a))[0];
    if (piece) {
      const rings = piece.map((r) => r.map(([lon, lat]) => ({ lat, lon })));
      const seed = hash32(p.id, "movein", this.closureSeq, Math.floor(t / 1000));
      const probe = rings[0][0];
      const pick = chooseResident(env, rings, seed, t, levels.levelAt(probe), undefined, pos ? { p: pos, m: 30 } : undefined);
      if (pick) {
        const res: Resident = { id: `m${seed.toString(36)}`, species: pick.species, ...(pick.variant ? { variant: pick.variant } : {}), home: pick.home, reserveId: levels.reserveAt(pick.home)?.id ?? "", since: t, reason: "moved_in" };
        added.push(res);
        this.residents = [...this.residents, res];
        this.syncProfileWorld(after);
        const ev = this.engine.forceAppear(residentCandidate(res, windowOf(t)), t, pos, "moved_in");
        this.log("animal_appear", ev as unknown as Record<string, unknown>);
        this.notify("walk.movedIn", { species: res.species });
      }
    }
    // Nya nivåer: jämför varje reservat med den högsta nivån bland de reservat det består av.
    const oldLevel = (id: string) => Math.max(0, ...before.filter((x) => x.id === id).map((x) => levelForArea(x.areaM2)));
    for (const r of after) {
      const was = oldLevel(r.id), now = levelForArea(r.areaM2);
      if (now <= was) continue;
      this.log("reserve_level", { id: r.id, from: was, to: now, areaM2: Math.round(r.areaM2) });
      if (now < 2) { this.notify("walk.levelUp", { level: now }); continue; }
      const rings = r.rings.map((ring) => ring.map(([lon, lat]) => ({ lat, lon })));
      const pick = chooseResident(env, rings, hash32(p.id, "level", r.id, now), t, now, now === 3 ? ["very_rare"] : ["rare"]);
      if (pick) {
        const res: Resident = { id: `l${hash32(p.id, r.id, now).toString(36)}`, species: pick.species, home: pick.home, reserveId: r.id, since: t, reason: now === 3 ? "level3" : "level2" };
        added.push(res);
        this.residents = [...this.residents, res];
        this.notify("walk.levelSpecies", { species: res.species, level: now });
      } else this.notify("walk.levelUp", { level: now });
    }
    if (added.length) {
      this.syncProfileWorld(after);
      await this.d.repo?.saveResidents(p.id, this.residents);
    }
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
      const before = this.view.reserves;
      this.syncProfileWorld(r.reserves);
      this.set({ reserves: r.reserves, totalAreaM2: totalAreaM2(r.reserves), lastClosure: { id: ++this.closureSeq, ha: r.addedM2 / 10_000, kind: r.grown.length ? "grew" : "new", pieces: r.newPieces, atMs: this.now() } });
      this.playSound({ kind: "chime", pan: 0, gain: 0.6 });
      this.log("reserve_closed", { addedM2: Math.round(r.addedM2), created: r.created, grown: r.grown, merged: r.merged, ms, breaks: r.breaks.length });
      await this.afterClosure(before, r.reserves, r.newPieces);
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
    await this.d.repo?.savePhoto({ id: photoId, profileId: p.id, createdAt: this.now(), blob: shot.blob, width: shot.width, height: shot.height, meta: { animalId, species: a.species, stars: rating.stars } });
    w.photos++;
    let observation: Observation | null = null, points = 0;
    const before = scoreFrom(this.observations);
    if (rating.stars > 0) {
      const already = this.observations.some((o) => o.animalId === a.id && o.stars > 0);
      points = already ? 0 : sp.points;
      observation = { id: `o${this.id()}`, profileId: p.id, walkId: w.id, animalId: a.id, species: a.species, ...(a.variant ? { variant: a.variant } : {}), photoId, stars: rating.stars as 1 | 2 | 3, points, distM: Math.round(distM), tMs: this.now(), lat: a.pos.lat, lon: a.pos.lon };
      this.observations.push(observation);
      await this.d.repo?.addObservation(observation);
      w.points += points;
    }
    await this.d.repo?.saveWalk(w);
    const score = scoreFrom(this.observations);
    this.set({ score, walk: { ...w } });
    const newSpecies = !before.species.includes(a.species) && score.species.includes(a.species);
    const tBefore = titleFor(before.species.length), tAfter = titleFor(score.species.length);
    this.log("photo_rated", { animalId, species: a.species, stars: rating.stars, distM: Math.round(distM), points, newSpecies });
    this.saveLog();
    return { stars: rating.stars, rating, points, newSpecies, species: a.species, ...(a.variant ? { variant: a.variant } : {}), photoId, observation, newTitle: tAfter !== tBefore ? tAfter : null };
  }

  /** För fältdiagnostik och e2e. */
  debug() { return { engine: this.engine?.s ?? null, track: this.track.length, env: !!this.env, addedThisWalkM2: this.addedThisWalkM2 }; }
}

const ll = (p: TrackPoint): LatLon => ({ lat: p.lat, lon: p.lon });
/** Ungefärlig yta (grader²) för att välja den största nya biten. */
const areaOf = (rings: [number, number][][]) => { const r = rings[0] ?? []; let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a) / 2; };

/** Miljö innan tiles har lästs in: allt är spärrat, så inga djur kan dyka upp. */
const emptyEnv: Environment = { habitat: () => "open", blocked: () => true, segmentBlocked: () => true, hazard: () => true, walkableDistM: () => Infinity, waterDistM: () => Infinity, forestWithin: () => false, size: 0 };
