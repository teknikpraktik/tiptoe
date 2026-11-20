import type { EngineState } from "@/engine/engine";
import type { Resident } from "@/engine/world";
import type { SpeciesId } from "@/engine/species";
import type { Reserve, TrackPoint } from "@/geo/reserves/reserves";
import type { Lang } from "@/i18n";
import type { Db } from "./idb";
import type { StoredPhoto } from "./photos";

/**
 * Lagringsabstraktionen (spec: Profiler, språk och lagring). All data ligger lokalt i IndexedDB bakom det här lagret, så att en server kan
 * läggas till senare utan att spelet skrivs om. Nycklarna har profilens id först, så att en profil kan exporteras eller raderas för sig.
 */
export const SCHEMA_VERSION = 1;

export interface Profile {
  id: string;
  name: string;
  kind: "child" | "adult";
  lang: Lang;
  /** Hemområdets radie (m), eller null. Används från fas 2. */
  homeRadiusM: number | null;
  createdAt: number;
}

export interface WalkMeta {
  id: string;
  profileId: string;
  startedAt: number;
  endedAt: number | null;
  distanceM: number;
  trackPoints: number;
  photos: number;
  points: number;
  addedM2: number;
}

export interface Observation {
  id: string;
  profileId: string;
  walkId: string;
  animalId: string;
  species: SpeciesId;
  photoId: string;
  stars: 1 | 2 | 3;
  /** Poäng som fotot gav (0 om individen redan var fotograferad). Totalen räknas alltid om, se `scoring.ts`. */
  points: number;
  distM: number;
  tMs: number;
  lat: number;
  lon: number;
}

/** Promenadens ögonblicksbild för återställning efter omstart. */
export interface WalkSnapshot {
  walkId: string;
  savedAt: number;
  engine: EngineState;
  addedThisWalkM2: number;
}

export const CHUNK_POINTS = 50;
const pad = (n: number) => String(n).padStart(6, "0");

export class Repo {
  constructor(readonly db: Db) {}

  // --- profiler ---
  async profiles(): Promise<Profile[]> { return this.db.store<Profile>("profiles").all(); }
  async saveProfile(p: Profile): Promise<void> { await this.db.store<Profile>("profiles").put(p.id, p); }
  /** Fas 1 har en profil; den skapas vid första start. */
  async ensureProfile(lang: Lang, now = Date.now()): Promise<Profile> {
    const [p] = await this.profiles();
    if (p) return p;
    const np: Profile = { id: "p1", name: "Ranger", kind: "adult", lang, homeRadiusM: null, createdAt: now };
    await this.saveProfile(np);
    await this.db.store("meta").put("schemaVersion", SCHEMA_VERSION);
    return np;
  }

  // --- promenader och spår i bitar ---
  async saveWalk(w: WalkMeta): Promise<void> { await this.db.store<WalkMeta>("walks").put(`${w.profileId}:m:${w.id}`, w); }
  async walks(profileId: string): Promise<WalkMeta[]> { return (await this.db.store<WalkMeta>("walks").range(`${profileId}:m:`)).sort((a, b) => a.startedAt - b.startedAt); }
  async activeWalk(profileId: string): Promise<WalkMeta | null> { return (await this.walks(profileId)).find((w) => w.endedAt === null) ?? null; }
  async saveChunk(profileId: string, walkId: string, seq: number, points: TrackPoint[]): Promise<void> {
    await this.db.store<{ seq: number; points: TrackPoint[] }>("walks").put(`${profileId}:c:${walkId}:${pad(seq)}`, { seq, points });
  }
  async track(profileId: string, walkId: string): Promise<TrackPoint[]> {
    const chunks = await this.db.store<{ seq: number; points: TrackPoint[] }>("walks").range(`${profileId}:c:${walkId}:`);
    return chunks.sort((a, b) => a.seq - b.seq).flatMap((c) => c.points);
  }
  async saveSnapshot(profileId: string, s: WalkSnapshot): Promise<void> { await this.db.store<WalkSnapshot>("world").put(`${profileId}:snap:${s.walkId}`, s); }
  async snapshot(profileId: string, walkId: string): Promise<WalkSnapshot | undefined> { return this.db.store<WalkSnapshot>("world").get(`${profileId}:snap:${walkId}`); }
  async deleteSnapshot(profileId: string, walkId: string): Promise<void> { await this.db.store("world").delete(`${profileId}:snap:${walkId}`); }

  // --- inflyttade djur (per profil, mellan promenader) ---
  async residents(profileId: string): Promise<Resident[]> { return (await this.db.store<Resident[]>("world").get(`${profileId}:residents`)) ?? []; }
  async saveResidents(profileId: string, rs: Resident[]): Promise<void> { await this.db.store<Resident[]>("world").put(`${profileId}:residents`, rs); }

  // --- reservat ---
  async reserves(profileId: string): Promise<Reserve[]> { return this.db.store<Reserve>("reserves").range(`${profileId}:`); }
  /** Ersätter profilens reservat (sammanslagna reservat försvinner). */
  async replaceReserves(profileId: string, rs: Reserve[]): Promise<void> {
    const st = this.db.store<Reserve>("reserves");
    await st.deleteRange(`${profileId}:`);
    for (const r of rs) await st.put(`${profileId}:${r.id}`, r);
  }

  // --- observationer och foton ---
  async addObservation(o: Observation): Promise<void> { await this.db.store<Observation>("observations").put(`${o.profileId}:${String(o.tMs).padStart(15, "0")}:${o.id}`, o); }
  async observations(profileId: string): Promise<Observation[]> { return this.db.store<Observation>("observations").range(`${profileId}:`); }
  async savePhoto(p: StoredPhoto): Promise<void> { await this.db.store<StoredPhoto>("photos").put(p.id, p); }
  async photo(id: string): Promise<StoredPhoto | undefined> { return this.db.store<StoredPhoto>("photos").get(id); }
}
