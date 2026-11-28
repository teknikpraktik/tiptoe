import type { EngineEvent } from "@/engine/engine";
import { SPECIES, type SpeciesId } from "@/engine/species";
import type { Habitat } from "@/geo/environment";
import { bearingDeg, haversineM, type LatLon } from "@/geo/geometry";
import { wrap180 } from "@/sensors/heading";
import { BACKGROUND, type SampleId } from "./samples";

/**
 * Ljudregi (spec: UX → Ljud). Ren logik: vilka ljud som spelas, inte hur. Uppspelningen (syntetiska ljud i WebAudio) ligger i synth.ts.
 * - Närhetsljud när ett djur kommer inom hörhåll, med panorering efter ungefärlig riktning; en gång per individ, nedkylning och gruppering
 *   (som i Outbreak).
 * - Frys-momentets förvarning har ett eget, tydligt ljud.
 * - Ambient efter miljön runt spelaren, låg volym, och då och då ett inspelat bakgrundsläte (fågel, mus) efter miljö och dygn.
 * - Djurens läten är inspelade (samples.ts); det syntetiska ljudet (`kind`) är reserven.
 */
export type SoundKind =
  | "rustle" | "twig" | "call" | "chatter" | "grunt" | "hoot" // närhet
  | "warn" // frys-förvarning
  | "flee" | "splash" | "wings" // flykt
  | "chime" | "shutter" // belöning, kamera
  | "ambient"; // bakgrundsläte (fåglar, möss): bara inspelat

export interface SoundCue {
  kind: SoundKind;
  /** −1 vänster … 1 höger */ pan: number;
  /** 0–1 */ gain: number;
  species?: SpeciesId;
  /** Inspelat läte som spelas i stället för det syntetiska ljudet (`kind` är reserven). */
  sample?: SampleId;
}
export type Ambience = "forest" | "water" | "urban" | "open" | "none";

export const AUDIO = {
  /** Hörhåll (m): djur hörs så här långt bort (före synen, se BEHAVIOR.visibleM). */
  hearM: 200,
  /** Minst så här lång tid (ms) mellan två närhetsljud; ljud inom grupperingsfönstret slås ihop till ett. */
  cooldownMs: 6000,
  groupMs: 1500,
  /** Vattnet hörs inom så här många meter. */
  waterM: 60,
  /** Ett djur inom hörhåll låter igen efter så här lång tid (ms), så att man kan leta efter det på gehör. */
  repeatMs: 45_000,
  /** Bakgrundsläten (fåglar, möss): ett läte med så här långt mellanrum (ms), slumpat i intervallet. Svag volym. */
  backgroundMs: [12_000, 35_000] as [number, number],
  backgroundGain: [0.18, 0.4] as [number, number],
} as const;

/** Närhetsljud per art: varningsläte för rådjur (skall), skrik för räv, kvitter för ekorre, grymtning för vildsvin, annars prassel/kvist. */
const PROXIMITY: Partial<Record<SpeciesId, SoundKind>> = {
  roe_deer: "call", red_fox: "call", squirrel: "chatter", wild_boar: "grunt", capercaillie: "hoot", white_tailed_eagle: "hoot", moose: "twig", brown_bear: "twig", reindeer: "grunt",
};

/** Panorering ur djurets bäring relativt den riktning spelaren tittar (null = okänd riktning: mitten). */
export function panFor(player: LatLon, animal: LatLon, headingDeg: number | null): number {
  if (headingDeg == null) return 0;
  return Math.sin((wrap180(bearingDeg(player, animal) - headingDeg) * Math.PI) / 180);
}

/** Starkare nära, svagt vid hörhållets gräns. */
export const gainFor = (distM: number) => Math.max(0.15, Math.min(1, 1 - distM / (AUDIO.hearM * 1.15)));

export interface HeardAnimal { id: string; species: SpeciesId; pos: LatLon; gone?: boolean }

export class SoundDirector {
  /** Individ → när den senast hördes (ms). */
  private heard = new Map<string, number>();
  private nextBackgroundMs: number | null = null;
  private rng = 0x2f6b1d;
  private rand(): number { this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0; return this.rng / 2 ** 32; }
  private lastProximityMs = -Infinity;
  private queued: { cue: SoundCue; atMs: number } | null = null;

  /** Ett steg: djuren som finns (även de som inte syns än) och motorns händelser. Returnerar ljud att spela nu. */
  update(o: { tMs: number; player: LatLon | null; headingDeg: number | null; animals: HeardAnimal[]; events: EngineEvent[]; ambience?: Ambience; night?: boolean }): SoundCue[] {
    const out: SoundCue[] = [];
    const { player } = o;
    const pos = new Map(o.animals.map((a) => [a.id, a]));
    const at = (id: string) => pos.get(id)?.pos ?? null;
    // Händelser: förvarning, flykt, inflyttning. De är viktiga och hörs alltid (ingen nedkylning).
    for (const e of o.events) {
      const p = at(e.id), pan = player && p ? panFor(player, p, o.headingDeg) : 0, g = player && p ? gainFor(haversineM(player, p)) : 0.6;
      if (e.type === "look_warn") out.push({ kind: "warn", pan, gain: Math.max(0.5, g) });
      if (e.type === "flee") {
        const sp = pos.get(e.id)?.species;
        const esc = sp ? SPECIES[sp].escape : "run";
        out.push({ kind: esc === "fly" ? "wings" : "flee", pan, gain: g, ...(sp ? { species: sp } : {}) });
      }
      if (e.type === "gone" && e.reason === "dove") out.push({ kind: "splash", pan, gain: g });
      if (e.type === "appear" && e.via === "moved_in") out.push({ kind: "chime", pan: 0, gain: 0.7 });
      if (e.type === "appear") this.heard.delete(e.id); // ett nytt djur ska höras när det kommer inom hörhåll
      // Ett djur som stannar efter en flykt låter: man hör var det tog vägen.
      if (e.type === "halt") { const sp = pos.get(e.id)?.species; if (sp) out.push({ kind: PROXIMITY[sp] ?? "rustle", pan, gain: g, species: sp, sample: sp }); }
    }
    // Närhet: varje individ en gång, när den kommer inom hörhåll. Nedkylning och gruppering så att det inte blir ett ljudmatta.
    if (player) {
      for (const a of o.animals) {
        const last = this.heard.get(a.id);
        if (a.gone || (last !== undefined && o.tMs - last < AUDIO.repeatMs)) continue;
        const d = haversineM(player, a.pos);
        if (d > AUDIO.hearM) continue;
        this.heard.set(a.id, o.tMs);
        const cue: SoundCue = { kind: PROXIMITY[a.species] ?? (a.id.charCodeAt(a.id.length - 1) % 2 ? "rustle" : "twig"), pan: panFor(player, a.pos, o.headingDeg), gain: gainFor(d), species: a.species, sample: a.species };
        if (this.queued && o.tMs - this.queued.atMs <= AUDIO.groupMs) continue; // grupperas med det som redan väntar
        this.queued = { cue, atMs: o.tMs };
      }
    }
    if (this.queued && o.tMs - this.lastProximityMs >= AUDIO.cooldownMs) {
      out.push(this.queued.cue);
      this.lastProximityMs = o.tMs;
      this.queued = null;
    }
    // Bakgrund: en fågel eller en mus då och då, efter miljö och dygn. Inte samtidigt som ett djurläte.
    if (o.ambience && o.ambience !== "none") {
      const [b0, b1] = AUDIO.backgroundMs;
      this.nextBackgroundMs ??= o.tMs + b0 / 2 + (b1 - b0) * this.rand() / 2;
      if (o.tMs >= this.nextBackgroundMs) {
        this.nextBackgroundMs = o.tMs + b0 + (b1 - b0) * this.rand();
        if (!out.length) {
          const pool = BACKGROUND[o.ambience][o.night ? "night" : "day"];
          const [g0, g1] = AUDIO.backgroundGain;
          out.push({ kind: "ambient", sample: pool[Math.floor(this.rand() * pool.length)], pan: this.rand() * 1.6 - 0.8, gain: g0 + (g1 - g0) * this.rand() });
        }
      }
    }
    return out;
  }

  reset(): void { this.heard.clear(); this.queued = null; this.lastProximityMs = -Infinity; this.nextBackgroundMs = null; }
}

/** Ambient efter miljön: vatten nära går före, sedan skog/park, bebyggelse, öppet. */
export function ambienceFor(habitat: Habitat, waterDistM: number): Ambience {
  if (waterDistM <= AUDIO.waterM) return "water";
  if (habitat === "forest" || habitat === "wetland" || habitat === "park") return "forest";
  if (habitat === "urban") return "urban";
  return "open";
}
