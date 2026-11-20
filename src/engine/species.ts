import type { Habitat } from "@/geo/environment";

/**
 * Artdata (spec: Djur och spelvärld → Arter, startvärden). Alla värden är konfigurerbara startvärden som justeras efter fälttest.
 * Fas 1 har fem arter. Aktiv tid finns som data men används först i fas 2 (spec: "tid på dygnet" ingår i fas 2).
 */
export type SpeciesId = "squirrel" | "roe_deer" | "red_fox" | "badger" | "moose";
export type Rarity = "common" | "uncommon" | "rare" | "very_rare";
export type DayPhase = "dawn" | "day" | "dusk" | "night";

export interface Species {
  id: SpeciesId;
  rarity: Rarity;
  points: number;
  /** Vikt per habitat (0 = förekommer inte). "edge" är en bonus när skog finns inom 40 m men platsen inte är skog (skogsbryn). */
  habitat: Partial<Record<Habitat, number>> & { edge?: number };
  active: Partial<Record<DayPhase, number>>;
  /** Upptäcktsradie i gångtempo (m); multipliceras med tempofaktorn. */
  detectionM: number;
  /** Fotoavstånd (m): kameran blir aktiv inom detta. */
  photoM: number;
  /** Flyktbenägenhet 0–1: hur fort oron växer. */
  skittish: number;
  walkMps: number;
  fleeMps: number;
  /** Höjd i meter (för kameran). */
  heightM: number;
  /** Ungefärlig livslängd i världen när djuret inte störs (s): vanliga djur ersätts oftare (spec: Beteende). */
  lifetimeS: number;
}

export const RARITY_POINTS: Record<Rarity, number> = { common: 50, uncommon: 100, rare: 250, very_rare: 1000 };
/** Grundvikt per klass när arter lottas (fas 1, utan reservatsnivåer). */
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 1, uncommon: 0.3, rare: 0.06, very_rare: 0 };

export const SPECIES: Record<SpeciesId, Species> = {
  squirrel: {
    id: "squirrel", rarity: "common", points: 50,
    habitat: { forest: 1, park: 1, urban: 0.5, grass: 0.2, field: 0.05, wetland: 0.2, open: 0.3 },
    active: { day: 1, dawn: 0.5, dusk: 0.3 },
    detectionM: 25, photoM: 15, skittish: 0.6, walkMps: 0.6, fleeMps: 4, heightM: 0.25, lifetimeS: 1200,
  },
  roe_deer: {
    id: "roe_deer", rarity: "common", points: 50,
    habitat: { forest: 0.5, edge: 0.6, field: 1, grass: 0.8, park: 0.4, urban: 0.1, wetland: 0.4, open: 0.5 },
    active: { dusk: 1, dawn: 1, day: 0.6, night: 0.3 },
    detectionM: 70, photoM: 35, skittish: 0.7, walkMps: 0.6, fleeMps: 8, heightM: 0.8, lifetimeS: 1800,
  },
  red_fox: {
    id: "red_fox", rarity: "common", points: 50,
    habitat: { forest: 0.6, edge: 0.3, field: 0.7, grass: 0.6, park: 0.6, urban: 0.5, wetland: 0.4, open: 0.6 },
    active: { dawn: 1, day: 0.7, dusk: 1, night: 1 },
    detectionM: 50, photoM: 30, skittish: 0.5, walkMps: 0.9, fleeMps: 6, heightM: 0.45, lifetimeS: 1500,
  },
  badger: {
    id: "badger", rarity: "uncommon", points: 100,
    habitat: { forest: 0.8, edge: 0.5, field: 0.2, grass: 0.1, park: 0.1, urban: 0.03, wetland: 0.1, open: 0.1 },
    active: { dusk: 1, night: 0.8, dawn: 0.3 },
    detectionM: 35, photoM: 20, skittish: 0.5, walkMps: 0.5, fleeMps: 3, heightM: 0.35, lifetimeS: 2400,
  },
  moose: {
    id: "moose", rarity: "uncommon", points: 100,
    habitat: { forest: 1, wetland: 1, edge: 0.3, field: 0.3, grass: 0.1, park: 0.02, urban: 0, open: 0.1 },
    active: { dusk: 1, dawn: 1, day: 0.7 },
    detectionM: 60, photoM: 40, skittish: 0.4, walkMps: 0.7, fleeMps: 6, heightM: 1.9, lifetimeS: 3000,
  },
};

export const PHASE1_SPECIES: SpeciesId[] = ["squirrel", "roe_deer", "red_fox", "badger", "moose"];

/** Artens vikt på en plats i fas 1: habitatvikt (+ skogsbryn) × klassvikt. */
export function speciesWeight(s: Species, habitat: Habitat, forestNear: boolean): number {
  const base = s.habitat[habitat] ?? 0;
  const edge = forestNear && habitat !== "forest" ? s.habitat.edge ?? 0 : 0;
  return Math.max(base, edge) * RARITY_WEIGHT[s.rarity];
}

/** Tempo och upptäcktsfaktor (spec: stilla 0,4 · smyg 0,7 · gång 1,0 · spring 1,6). */
export type Tempo = "still" | "sneak" | "walk" | "run";
export const TEMPO_FACTOR: Record<Tempo, number> = { still: 0.4, sneak: 0.7, walk: 1, run: 1.6 };
