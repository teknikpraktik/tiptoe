import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { EngineState } from "@/engine/engine";
import type { Resident } from "@/engine/world";
import type { Reserve, TrackPoint } from "@/geo/reserves/reserves";
import type { FieldLogData } from "@/play/fieldlog";
import type { StoredPhoto } from "./photos";
import { SCHEMA_VERSION, type Observation, type Profile, type Repo, type WalkMeta, type WalkSnapshot } from "./repo";

/**
 * Export och import av en hel profil (spec: Export och import). En versionsmärkt zip-fil: manifest med schemaversion, JSON-data och bilder.
 * Import valideras mot schemat, visar innehållet först och skriver aldrig tyst över befintliga data: ny profil, eller ersätt efter bekräftelse.
 * Exportfilen innehåller GPS-spåren (gränssnittet varnar för det vid delning).
 */
export const EXPORT_FORMAT = "tiptoe-profile";
/** Högsta tillåtna storlek på en importfil (skydd mot orimliga filer). */
export const MAX_IMPORT_BYTES = 500 * 1024 * 1024;

export interface ExportManifest {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  build: string;
  profile: { id: string; name: string };
  counts: { walks: number; trackPoints: number; reserves: number; observations: number; photos: number; residents: number };
}

export interface ExportData {
  profile: Profile;
  walks: WalkMeta[];
  tracks: Record<string, TrackPoint[]>;
  snapshots: WalkSnapshot[];
  reserves: Reserve[];
  observations: Observation[];
  residents: Resident[];
  logs: FieldLogData[];
  photos: Omit<StoredPhoto, "blob">[];
}

const jpg = (id: string) => `photos/${id}.jpg`;

export async function exportProfile(repo: Repo, profileId: string, build = "dev", now = Date.now()): Promise<{ bytes: Uint8Array; manifest: ExportManifest }> {
  const profile = await repo.profile(profileId);
  if (!profile) throw new Error("no such profile");
  const walks = await repo.walks(profileId);
  const tracks: Record<string, TrackPoint[]> = {};
  const snapshots: WalkSnapshot[] = [];
  const logs: FieldLogData[] = [];
  for (const w of walks) {
    tracks[w.id] = await repo.track(profileId, w.id);
    const s = await repo.snapshot(profileId, w.id);
    if (s) snapshots.push(s);
    const l = await repo.db.store<FieldLogData>("meta").get(`log:${w.id}`);
    if (l) logs.push(l);
  }
  const reserves = await repo.reserves(profileId);
  const observations = await repo.observations(profileId);
  const residents = await repo.residents(profileId);
  const refs = new Set(observations.map((o) => o.photoId));
  const photos = (await repo.db.store<StoredPhoto>("photos").all()).filter((p) => p.profileId === profileId || refs.has(p.id));
  const files: Record<string, Uint8Array> = {};
  for (const p of photos) files[jpg(p.id)] = new Uint8Array(await p.blob.arrayBuffer());
  const data: ExportData = { profile, walks, tracks, snapshots, reserves, observations, residents, logs, photos: photos.map(({ blob: _b, ...rest }) => rest) };
  const manifest: ExportManifest = {
    format: EXPORT_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: new Date(now).toISOString(), build,
    profile: { id: profile.id, name: profile.name },
    counts: { walks: walks.length, trackPoints: Object.values(tracks).reduce((a, t) => a + t.length, 0), reserves: reserves.length, observations: observations.length, photos: photos.length, residents: residents.length },
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 1));
  files["data.json"] = strToU8(JSON.stringify(data));
  // Bilderna är redan JPEG: lagras utan komprimering (level 0); JSON komprimeras.
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: k.endsWith(".jpg") ? 0 : 6 }]])) as Parameters<typeof zipSync>[0]);
  return { bytes: zip, manifest };
}

export type ImportProblem = "not_zip" | "too_big" | "wrong_format" | "newer_schema" | "invalid_data" | "missing_photo";
export class ImportError extends Error { constructor(readonly problem: ImportProblem, detail = "") { super(`${problem}${detail ? `: ${detail}` : ""}`); } }

export interface ParsedImport { manifest: ExportManifest; data: ExportData; photoBytes: Map<string, Uint8Array> }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Läser och validerar en exportfil. Kastar ImportError med orsaken; skriver ingenting. */
export function parseImport(bytes: Uint8Array): ParsedImport {
  if (bytes.length > MAX_IMPORT_BYTES) throw new ImportError("too_big");
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new ImportError("not_zip"); }
  let manifest: unknown, data: unknown;
  try { manifest = JSON.parse(strFromU8(files["manifest.json"])); data = JSON.parse(strFromU8(files["data.json"])); } catch { throw new ImportError("wrong_format"); }
  if (!isObj(manifest) || manifest.format !== EXPORT_FORMAT || !isNum(manifest.schemaVersion)) throw new ImportError("wrong_format");
  if (manifest.schemaVersion > SCHEMA_VERSION) throw new ImportError("newer_schema", String(manifest.schemaVersion));
  if (!isObj(data)) throw new ImportError("invalid_data", "data");
  const d = data as unknown as ExportData;
  const p = d.profile as unknown;
  if (!isObj(p) || !isStr(p.id) || !isStr(p.name) || (p.kind !== "child" && p.kind !== "adult") || (p.lang !== "sv" && p.lang !== "en")) throw new ImportError("invalid_data", "profile");
  for (const k of ["walks", "snapshots", "reserves", "observations", "residents", "logs", "photos"] as const) if (!Array.isArray(d[k])) throw new ImportError("invalid_data", k);
  if (!isObj(d.tracks)) throw new ImportError("invalid_data", "tracks");
  for (const w of d.walks) if (!isStr(w?.id) || !isNum(w?.startedAt)) throw new ImportError("invalid_data", "walk");
  for (const t of Object.values(d.tracks)) if (!Array.isArray(t) || t.some((x) => !isNum(x?.lat) || !isNum(x?.lon) || !isNum(x?.tMs))) throw new ImportError("invalid_data", "track");
  for (const r of d.reserves) if (!isStr(r?.id) || !Array.isArray(r?.rings) || !isNum(r?.areaM2)) throw new ImportError("invalid_data", "reserve");
  for (const o of d.observations) if (!isStr(o?.id) || !isStr(o?.animalId) || !isStr(o?.species) || !isStr(o?.photoId) || ![1, 2, 3].includes(o?.stars)) throw new ImportError("invalid_data", "observation");
  const photoBytes = new Map<string, Uint8Array>();
  for (const ph of d.photos) {
    if (!isStr(ph?.id)) throw new ImportError("invalid_data", "photo");
    const b = files[jpg(ph.id)];
    if (!b) throw new ImportError("missing_photo", ph.id);
    photoBytes.set(ph.id, b);
  }
  return { manifest: manifest as unknown as ExportManifest, data: d, photoBytes };
}

/**
 * Skriver en validerad import. `as` = "new": en ny profil (nytt id; foton får nya id så att inget krockar med befintliga), eller ett befintligt
 * profil-id som ersätts helt (bara efter bekräftelse i gränssnittet).
 */
export async function applyImport(repo: Repo, imp: ParsedImport, as: { mode: "new"; newId: string } | { mode: "replace"; profileId: string }): Promise<Profile> {
  const { data } = imp;
  const pid = as.mode === "new" ? as.newId : as.profileId;
  if (as.mode === "replace") await repo.deleteProfile(pid);
  // Som ny profil får foton och promenader nya id: fältloggar och foton nycklas globalt och får inte delas med originalet.
  const photoId = (id: string) => (as.mode === "new" ? `${id}-${pid}` : id);
  const walkId = (id: string) => (as.mode === "new" ? `${id}-${pid}` : id);
  const profile: Profile = { ...data.profile, id: pid };
  await repo.saveProfile(profile);
  for (const w of data.walks) {
    await repo.saveWalk({ ...w, id: walkId(w.id), profileId: pid });
    const t = data.tracks[w.id] ?? [];
    for (let seq = 0; seq * 50 < t.length; seq++) await repo.saveChunk(pid, walkId(w.id), seq, t.slice(seq * 50, seq * 50 + 50));
  }
  for (const s of data.snapshots) await repo.saveSnapshot(pid, { ...(s as WalkSnapshot & { engine: EngineState }), walkId: walkId(s.walkId) });
  await repo.replaceReserves(pid, data.reserves);
  for (const o of data.observations) await repo.addObservation({ ...o, profileId: pid, walkId: walkId(o.walkId), photoId: photoId(o.photoId) });
  await repo.saveResidents(pid, data.residents);
  for (const l of data.logs) await repo.db.store<FieldLogData>("meta").put(`log:${walkId(l.walkId)}`, { ...l, walkId: walkId(l.walkId) });
  for (const ph of data.photos) {
    const bytes = imp.photoBytes.get(ph.id)!;
    await repo.savePhoto({ ...ph, id: photoId(ph.id), profileId: pid, blob: new Blob([bytes as BlobPart], { type: "image/jpeg" }) });
  }
  return profile;
}
