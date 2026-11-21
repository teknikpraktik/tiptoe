import { WATER_CLEARANCE_M, type Habitat } from "@/geo/environment";

/**
 * Artdata (spec: Djur och spelvärld → Arter, startvärden). Alla värden är konfigurerbara startvärden som justeras efter fälttest.
 * En ändring här ändrar världen: fingeravtrycket (src/tests/fixtures/world-fingerprint.txt) uppdateras i samma PR.
 */
export type SpeciesId =
  | "squirrel" | "hare" | "roe_deer" | "red_fox" | "hedgehog"
  | "badger" | "beaver" | "wild_boar" | "moose"
  | "capercaillie" | "otter" | "lynx"
  | "wolf" | "brown_bear" | "white_tailed_eagle"
  | "reindeer";
export type Rarity = "common" | "uncommon" | "rare" | "very_rare";
export type DayPhase = "dawn" | "day" | "dusk" | "night";
/** Hur djuret flyr: springer, dyker undan i vatten (utter, bäver) eller lyfter (fåglar). */
export type Escape = "run" | "dive" | "fly";

export interface Variant { id: string; chance: number }

export interface Species {
  id: SpeciesId;
  rarity: Rarity;
  points: number;
  /** Vikt per habitat (0 = förekommer inte). "edge" är en bonus när skog finns inom 40 m men platsen inte är skog (skogsbryn). */
  habitat: Partial<Record<Habitat, number>> & { edge?: number };
  /** Aktivitet per dygnsfas 0–1 (spec: Aktiv). Saknad fas = inaktiv. */
  active: Partial<Record<DayPhase, number>>;
  /** Krav (spec: kolumnen Krav). */
  needs?: {
    /** Bara i vattenzonen: på land 12–100 m från större vatten. */
    waterZone?: boolean;
    /** Minsta vattenyta (m²) som räknas som "större vatten" för arten. Hav räknas alltid. */
    waterAreaM2?: number;
    /** Åar och bäckar räknas också som vatten för vattenzonen (bäver, utter). */
    streams?: boolean;
    /** Bara i höglänt terräng (fjällen och de högre delarna av norra Dalarna och Värmland), se `geo/regions.ts`. */
    upland?: boolean;
    /** Lägsta reservatsnivå där arten kan finnas (fas 2.3). */
    minLevel?: 0 | 1 | 2 | 3;
  };
  escape: Escape;
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
  /** Ungefärlig livslängd i världen när djuret inte störs (s): vanliga ersätts oftare, sällsynta lever längre (spec: Beteende). */
  lifetimeS: number;
  /** Sällsynta utseenden (spec: Varianter), med sannolikhet per individ. */
  variants?: Variant[];
}

export const RARITY_POINTS: Record<Rarity, number> = { common: 50, uncommon: 100, rare: 250, very_rare: 1000 };
/** Grundvikt per klass utan reservat (nivå 0). Reservatsnivåerna (fas 2.3) höjer de ovanligare klasserna. */
export const RARITY_WEIGHT: Record<Rarity, number> = { common: 1, uncommon: 0.3, rare: 0.04, very_rare: 0 };

/** Vattenzonen (spec: Vatten): på land minst 12 m och högst 100 m från större vatten. */
export const WATER_ZONE = { minM: WATER_CLEARANCE_M, maxM: 100, defaultAreaM2: 5000 } as const;

const L = { common: 1500, uncommon: 2400, rare: 3600, very_rare: 3600 };

export const SPECIES: Record<SpeciesId, Species> = {
  squirrel: {
    id: "squirrel", rarity: "common", points: 50, escape: "run",
    habitat: { forest: 1, park: 1, urban: 0.5, grass: 0.2, field: 0.05, wetland: 0.2, open: 0.3 },
    active: { day: 1, dawn: 0.5, dusk: 0.3 },
    detectionM: 25, photoM: 15, skittish: 0.6, walkMps: 0.6, fleeMps: 4, heightM: 0.25, lifetimeS: L.common,
    variants: [{ id: "black", chance: 0.04 }],
  },
  hare: {
    id: "hare", rarity: "common", points: 50, escape: "run",
    habitat: { forest: 0.6, edge: 0.6, grass: 1, field: 1, park: 0.2, urban: 0.05, wetland: 0.3, open: 0.6 },
    active: { dusk: 1, dawn: 1, day: 0.5, night: 0.5 },
    detectionM: 40, photoM: 25, skittish: 0.8, walkMps: 0.8, fleeMps: 9, heightM: 0.35, lifetimeS: L.common,
    variants: [{ id: "winter_white", chance: 0.05 }],
  },
  roe_deer: {
    id: "roe_deer", rarity: "common", points: 50, escape: "run",
    habitat: { forest: 0.5, edge: 0.6, field: 1, grass: 0.8, park: 0.4, urban: 0.1, wetland: 0.4, open: 0.5 },
    active: { dusk: 1, dawn: 1, day: 0.6, night: 0.3 },
    detectionM: 70, photoM: 35, skittish: 0.7, walkMps: 0.6, fleeMps: 8, heightM: 0.8, lifetimeS: L.common,
    variants: [{ id: "big_buck", chance: 0.04 }],
  },
  red_fox: {
    id: "red_fox", rarity: "common", points: 50, escape: "run",
    habitat: { forest: 0.6, edge: 0.3, field: 0.7, grass: 0.6, park: 0.6, urban: 0.5, wetland: 0.4, open: 0.6 },
    active: { dawn: 1, day: 0.7, dusk: 1, night: 1 },
    detectionM: 50, photoM: 30, skittish: 0.5, walkMps: 0.9, fleeMps: 6, heightM: 0.45, lifetimeS: L.common,
    variants: [{ id: "dark", chance: 0.03 }],
  },
  hedgehog: {
    id: "hedgehog", rarity: "common", points: 50, escape: "run",
    habitat: { park: 1, urban: 0.7, grass: 0.4, edge: 0.3, forest: 0.1, field: 0.1, open: 0.3 },
    active: { dusk: 1, night: 1, dawn: 0.3, day: 0.1 },
    detectionM: 12, photoM: 8, skittish: 0.2, walkMps: 0.3, fleeMps: 0.8, heightM: 0.15, lifetimeS: L.common,
  },
  badger: {
    id: "badger", rarity: "uncommon", points: 100, escape: "run",
    habitat: { forest: 0.8, edge: 0.5, field: 0.2, grass: 0.1, park: 0.1, urban: 0.03, wetland: 0.1, open: 0.1 },
    active: { dusk: 1, night: 0.8, dawn: 0.3, day: 0.05 },
    detectionM: 35, photoM: 20, skittish: 0.5, walkMps: 0.5, fleeMps: 3, heightM: 0.35, lifetimeS: L.uncommon,
  },
  beaver: {
    id: "beaver", rarity: "uncommon", points: 100, escape: "dive",
    habitat: { forest: 1, wetland: 1, edge: 1, grass: 0.8, park: 0.5, field: 0.5, open: 0.8, urban: 0.1 },
    active: { dusk: 1, night: 0.7, dawn: 0.6, day: 0.1 },
    // Vid åar, bäckar och sjöar.
    needs: { waterZone: true, streams: true },
    detectionM: 40, photoM: 25, skittish: 0.6, walkMps: 0.5, fleeMps: 2.5, heightM: 0.4, lifetimeS: L.uncommon,
  },
  wild_boar: {
    id: "wild_boar", rarity: "uncommon", points: 100, escape: "run",
    habitat: { forest: 1, edge: 0.8, field: 0.8, grass: 0.3, wetland: 0.3, park: 0.05, urban: 0, open: 0.2 },
    active: { dusk: 1, night: 0.8, dawn: 0.6, day: 0.1 },
    detectionM: 45, photoM: 30, skittish: 0.5, walkMps: 0.8, fleeMps: 7, heightM: 0.9, lifetimeS: L.uncommon,
  },
  moose: {
    id: "moose", rarity: "uncommon", points: 100, escape: "run",
    habitat: { forest: 1, wetland: 1, edge: 0.3, field: 0.3, grass: 0.1, park: 0.02, urban: 0, open: 0.1 },
    active: { dusk: 1, dawn: 1, day: 0.7, night: 0.2 },
    detectionM: 60, photoM: 40, skittish: 0.4, walkMps: 0.7, fleeMps: 6, heightM: 1.9, lifetimeS: L.uncommon,
    variants: [{ id: "big_bull", chance: 0.05 }],
  },
  capercaillie: {
    id: "capercaillie", rarity: "rare", points: 250, escape: "fly",
    // Specen: barrskog. OpenMapTiles skiljer inte barr- från lövskog i landcover, så all skog räknas.
    habitat: { forest: 1, wetland: 0.2, edge: 0.2 },
    active: { dawn: 1, day: 0.8, dusk: 0.3 },
    detectionM: 50, photoM: 30, skittish: 0.8, walkMps: 0.5, fleeMps: 0, heightM: 0.8, lifetimeS: L.rare,
  },
  otter: {
    id: "otter", rarity: "rare", points: 250, escape: "dive",
    habitat: { forest: 1, wetland: 1, edge: 1, grass: 0.7, park: 0.3, field: 0.5, open: 0.7, urban: 0.05 },
    active: { dusk: 1, night: 0.6, dawn: 0.7, day: 0.2 },
    needs: { waterZone: true, streams: true },
    detectionM: 40, photoM: 25, skittish: 0.7, walkMps: 0.8, fleeMps: 4, heightM: 0.3, lifetimeS: L.rare,
  },
  lynx: {
    id: "lynx", rarity: "rare", points: 250, escape: "run",
    habitat: { forest: 1, edge: 0.4, wetland: 0.2 },
    active: { dusk: 1, night: 0.6, dawn: 0.6, day: 0.1 },
    detectionM: 60, photoM: 35, skittish: 0.8, walkMps: 0.8, fleeMps: 8, heightM: 0.65, lifetimeS: L.rare,
  },
  wolf: {
    id: "wolf", rarity: "very_rare", points: 1000, escape: "run",
    habitat: { forest: 1, edge: 0.3, wetland: 0.3 },
    active: { dusk: 1, night: 0.6, dawn: 0.7, day: 0.1 },
    needs: { minLevel: 3 },
    detectionM: 80, photoM: 45, skittish: 0.8, walkMps: 1.2, fleeMps: 9, heightM: 0.8, lifetimeS: L.very_rare,
  },
  brown_bear: {
    id: "brown_bear", rarity: "very_rare", points: 1000, escape: "run",
    habitat: { forest: 1, wetland: 0.4, edge: 0.3 },
    active: { day: 1, dusk: 1, dawn: 0.6, night: 0.1 },
    needs: { minLevel: 3 },
    detectionM: 60, photoM: 45, skittish: 0.4, walkMps: 0.8, fleeMps: 6, heightM: 1.1, lifetimeS: L.very_rare,
  },
  white_tailed_eagle: {
    id: "white_tailed_eagle", rarity: "very_rare", points: 1000, escape: "fly",
    habitat: { forest: 1, wetland: 1, edge: 1, grass: 1, field: 1, open: 1, park: 0.3, urban: 0 },
    active: { day: 1, dawn: 0.3, dusk: 0.3 },
    // Sitter högt vid kusten eller stora sjöar (≥ 50 ha); kräver nivå 3 eller dyker upp som observation (fas 2.3).
    needs: { waterZone: true, waterAreaM2: 500_000, minLevel: 3 },
    detectionM: 80, photoM: 50, skittish: 0.6, walkMps: 0, fleeMps: 0, heightM: 0.9, lifetimeS: L.very_rare,
  },
  // Tillägg utöver specens 15 arter (Pers önskemål 2026-11-21): bara i höglänt terräng, till exempel Sälen, Idre, Branäs och fjällen.
  reindeer: {
    id: "reindeer", rarity: "uncommon", points: 100, escape: "run",
    habitat: { open: 1, grass: 1, wetland: 0.8, forest: 0.6, edge: 0.8, field: 0.3, park: 0.05, urban: 0 },
    active: { dawn: 1, day: 0.8, dusk: 1, night: 0.3 },
    needs: { upland: true },
    detectionM: 50, photoM: 30, skittish: 0.35, walkMps: 0.7, fleeMps: 6, heightM: 1.1, lifetimeS: L.uncommon,
    variants: [{ id: "white", chance: 0.03 }],
  },
};

export const ALL_SPECIES = Object.keys(SPECIES) as SpeciesId[];

/** Var platsen ligger i förhållande till vatten, för vattenarterna. */
export interface WaterContext {
  /** Avstånd (m) till närmaste vatten av minst den storlek arten kräver (med `streams` även åar och bäckar), eller Infinity. */
  distToWater(minAreaM2: number, streams?: boolean): number;
}

export interface WeightContext {
  habitat: Habitat;
  forestNear: boolean;
  water: WaterContext;
  phase: DayPhase;
  /** Reservatsnivå på platsen (0 utanför reservat). */
  level: 0 | 1 | 2 | 3;
  /** Platsen ligger i höglänt terräng (`geo/regions.ts`). */
  upland?: boolean;
  /** Klassvikter för nivån (fas 2.3); standard RARITY_WEIGHT. */
  rarityWeight?: Record<Rarity, number>;
}

export function inWaterZone(s: Species, w: WaterContext): boolean {
  const d = w.distToWater(s.needs?.waterAreaM2 ?? WATER_ZONE.defaultAreaM2, s.needs?.streams);
  return d >= WATER_ZONE.minM && d <= WATER_ZONE.maxM;
}

/** Artens vikt på en plats: habitat (+ skogsbryn) × klassvikt × aktivitet, med specens krav (vattenzon, nivå). */
export function speciesWeight(s: Species, c: WeightContext): number {
  if ((s.needs?.minLevel ?? 0) > c.level) return 0;
  if (s.needs?.upland && !c.upland) return 0;
  if (s.needs?.waterZone && !inWaterZone(s, c.water)) return 0;
  const base = s.habitat[c.habitat] ?? 0;
  const edge = c.forestNear && c.habitat !== "forest" ? s.habitat.edge ?? 0 : 0;
  return Math.max(base, edge) * (c.rarityWeight ?? RARITY_WEIGHT)[s.rarity] * (s.active[c.phase] ?? 0);
}

/** Tempo och upptäcktsfaktor (spec: stilla 0,4 · smyg 0,7 · gång 1,0 · spring 1,6). */
export type Tempo = "still" | "sneak" | "walk" | "run";
export const TEMPO_FACTOR: Record<Tempo, number> = { still: 0.4, sneak: 0.7, walk: 1, run: 1.6 };
