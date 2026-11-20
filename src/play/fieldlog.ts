// Origin: teknikpraktik/solosurvival@033a121 src/play/fieldlog.ts (kategori B: lokal testlogg, export bara när spelaren väljer det).
import type { Db } from "@/storage/idb";

export const LOG_SCHEMA = 1;
const MAX_ENTRIES = 6000;

export interface LogEntry {
  /** Millisekunder sedan promenaden startade. */
  t: number;
  k: string;
  d?: Record<string, unknown>;
}

export interface GpsCounters { fixes: number; accepted: number; jumps: number; errors: number; accuracySumM: number; accuracyMaxM: number; dropouts: number; longestDropoutS: number }

export interface FieldLogData {
  schema: number;
  walkId: string;
  startedAtIso: string;
  build: string;
  userAgent?: string;
  standalone?: boolean;
  entries: LogEntry[];
  gps: GpsCounters;
  battery: { note: string };
  summary?: Record<string, unknown>;
}

/**
 * Fältloggen för en promenad (spec: fälttestversion med exporterbar logg – möten, flykt, reservat, kamerafel). Allt stannar i telefonen
 * (lagret `meta`); export sker bara när spelaren trycker på knappen.
 */
export class FieldLog {
  readonly data: FieldLogData;
  private t0: number;
  private lastFixMs = 0;

  constructor(walkId: string, now: number, build: string, userAgent?: string, standalone?: boolean) {
    this.t0 = now;
    this.data = {
      schema: LOG_SCHEMA, walkId, startedAtIso: new Date(now).toISOString(), build, userAgent, standalone, entries: [],
      gps: { fixes: 0, accepted: 0, jumps: 0, errors: 0, accuracySumM: 0, accuracyMaxM: 0, dropouts: 0, longestDropoutS: 0 },
      battery: { note: "Batteri mäts för hand: notera procent före och efter, och skärmens ljusstyrka. Webbläsare på iPhone saknar Battery API." },
    };
  }

  static fromData(d: FieldLogData): FieldLog {
    const l = new FieldLog(d.walkId, Date.parse(d.startedAtIso) || 0, d.build);
    Object.assign(l.data, d);
    l.t0 = Date.parse(d.startedAtIso) || 0;
    return l;
  }

  add(now: number, k: string, d?: Record<string, unknown>): void {
    if (this.data.entries.length >= MAX_ENTRIES) return;
    this.data.entries.push({ t: now - this.t0, k, d });
  }

  /** Räknare per GPS-fix; ett avbrott är mer än 10 s utan fix. */
  fix(now: number, accepted: boolean, jump: boolean, accuracyM: number): void {
    const g = this.data.gps;
    g.fixes++;
    if (accepted) { g.accepted++; g.accuracySumM += accuracyM; g.accuracyMaxM = Math.max(g.accuracyMaxM, accuracyM); }
    if (jump) g.jumps++;
    if (this.lastFixMs && now - this.lastFixMs > 10_000) { g.dropouts++; g.longestDropoutS = Math.max(g.longestDropoutS, Math.round((now - this.lastFixMs) / 1000)); }
    this.lastFixMs = now;
  }

  summarize(extra: Record<string, unknown>): void {
    const g = this.data.gps;
    const count = (k: string) => this.data.entries.filter((e) => e.k === k).length;
    this.data.summary = {
      meanAccuracyM: g.accepted ? Math.round((g.accuracySumM / g.accepted) * 10) / 10 : null,
      encounters: count("animal_appear"), flights: count("animal_flee"), photos: count("photo_rated"), reserveClosures: count("reserve_closed"), cameraErrors: count("camera_error"),
      ...extra,
    };
  }

  async save(db: Db): Promise<void> { await db.store<FieldLogData>("meta").put(`log:${this.data.walkId}`, this.data); }
}

export async function listLogs(db: Db): Promise<FieldLogData[]> {
  return (await db.store<FieldLogData>("meta").range("log:")).sort((a, b) => b.startedAtIso.localeCompare(a.startedAtIso));
}
export async function loadLog(db: Db, walkId: string): Promise<FieldLogData | undefined> { return db.store<FieldLogData>("meta").get(`log:${walkId}`); }
export async function deleteLog(db: Db, walkId: string): Promise<void> { await db.store("meta").delete(`log:${walkId}`); }
