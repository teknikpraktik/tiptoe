import type { EngineEvent } from "@/engine/engine";
import { SPECIES, type SpeciesId } from "@/engine/species";
import type { Habitat } from "@/geo/environment";
import { bearingDeg, haversineM, type LatLon } from "@/geo/geometry";
import { wrap180 } from "@/sensors/heading";

/**
 * Ljudregi (spec: UX → Ljud). Ren logik: vilka ljud som spelas, inte hur. Uppspelningen (syntetiska ljud i WebAudio) ligger i synth.ts.
 * - Närhetsljud när ett djur kommer inom hörhåll, med panorering efter ungefärlig riktning; en gång per individ, nedkylning och gruppering
 *   (som i Outbreak).
 * - Frys-momentets förvarning har ett eget, tydligt ljud.
 * - Ambient efter miljön runt spelaren, låg volym.
 */
export type SoundKind =
  | "rustle" | "twig" | "call" | "chatter" | "grunt" | "hoot" // närhet
  | "warn" // frys-förvarning
  | "flee" | "splash" | "wings" // flykt
  | "chime" | "shutter"; // belöning, kamera

export interface SoundCue { kind: SoundKind; /** −1 vänster … 1 höger */ pan: number; /** 0–1 */ gain: number; species?: SpeciesId }
export type Ambience = "forest" | "water" | "urban" | "open" | "none";

export const AUDIO = {
  /** Hörhåll (m): djur hörs så här långt bort (före synen, se BEHAVIOR.visibleM). */
  hearM: 200,
  /** Minst så här lång tid (ms) mellan två närhetsljud; ljud inom grupperingsfönstret slås ihop till ett. */
  cooldownMs: 6000,
  groupMs: 1500,
  /** Vattnet hörs inom så här många meter. */
  waterM: 60,
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
  private heard = new Set<string>();
  private lastProximityMs = -Infinity;
  private queued: { cue: SoundCue; atMs: number } | null = null;

  /** Ett steg: djuren som finns (även de som inte syns än) och motorns händelser. Returnerar ljud att spela nu. */
  update(o: { tMs: number; player: LatLon | null; headingDeg: number | null; animals: HeardAnimal[]; events: EngineEvent[] }): SoundCue[] {
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
    }
    // Närhet: varje individ en gång, när den kommer inom hörhåll. Nedkylning och gruppering så att det inte blir ett ljudmatta.
    if (player) {
      for (const a of o.animals) {
        if (a.gone || this.heard.has(a.id)) continue;
        const d = haversineM(player, a.pos);
        if (d > AUDIO.hearM) continue;
        this.heard.add(a.id);
        const cue: SoundCue = { kind: PROXIMITY[a.species] ?? (a.id.charCodeAt(a.id.length - 1) % 2 ? "rustle" : "twig"), pan: panFor(player, a.pos, o.headingDeg), gain: gainFor(d), species: a.species };
        if (this.queued && o.tMs - this.queued.atMs <= AUDIO.groupMs) continue; // grupperas med det som redan väntar
        this.queued = { cue, atMs: o.tMs };
      }
    }
    if (this.queued && o.tMs - this.lastProximityMs >= AUDIO.cooldownMs) {
      out.push(this.queued.cue);
      this.lastProximityMs = o.tMs;
      this.queued = null;
    }
    return out;
  }

  reset(): void { this.heard.clear(); this.queued = null; this.lastProximityMs = -Infinity; }
}

/** Ambient efter miljön: vatten nära går före, sedan skog/park, bebyggelse, öppet. */
export function ambienceFor(habitat: Habitat, waterDistM: number): Ambience {
  if (waterDistM <= AUDIO.waterM) return "water";
  if (habitat === "forest" || habitat === "wetland" || habitat === "park") return "forest";
  if (habitat === "urban") return "urban";
  return "open";
}
