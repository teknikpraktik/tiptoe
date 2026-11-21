import { ALL_SPECIES, SPECIES, type SpeciesId } from "./species";

/**
 * Progression (spec: Poäng, progression och fältdagbok): arträknare, titlar efter dagboken och varianter. Exakta trappsteg här.
 * Allt räknas ur sparade observationer.
 */
export const TITLES = [
  { id: "newcomer", species: 0 },
  { id: "tracker", species: 3 },
  { id: "ranger", species: 8 },
  { id: "senior_ranger", species: 12 },
  // Specens 15 arter. Renen (bara i fjällen) är en bonusart: ingen ska behöva resa för den högsta titeln.
  { id: "master_ranger", species: 15 },
] as const;
export type TitleId = (typeof TITLES)[number]["id"];

export interface ObservationLike { animalId: string; species: SpeciesId; stars: number; tMs: number; photoId: string; variant?: string }

export interface SpeciesEntry {
  species: SpeciesId;
  found: boolean;
  individuals: number;
  photos: number;
  bestStars: number;
  variants: string[];
  /** Foton, nyast först. */
  photoIds: string[];
  firstMs: number | null;
}

export interface FieldBook {
  entries: SpeciesEntry[];
  speciesFound: number;
  total: number;
  title: TitleId;
  nextTitle: { id: TitleId; species: number } | null;
}

export function titleFor(speciesFound: number): TitleId {
  let t: TitleId = TITLES[0].id;
  for (const x of TITLES) if (speciesFound >= x.species) t = x.id;
  return t;
}

export function fieldBook(obs: ObservationLike[]): FieldBook {
  const by = new Map<SpeciesId, ObservationLike[]>();
  for (const o of obs) if (o.stars > 0) { const l = by.get(o.species) ?? []; l.push(o); by.set(o.species, l); }
  // Ordning: klass (vanliga först), sedan specens ordning.
  const order: Record<string, number> = { common: 0, uncommon: 1, rare: 2, very_rare: 3 };
  const entries = [...ALL_SPECIES].sort((a, b) => order[SPECIES[a].rarity] - order[SPECIES[b].rarity]).map((species): SpeciesEntry => {
    const l = (by.get(species) ?? []).sort((a, b) => b.tMs - a.tMs);
    return {
      species,
      found: l.length > 0,
      individuals: new Set(l.map((o) => o.animalId)).size,
      photos: l.length,
      bestStars: Math.max(0, ...l.map((o) => o.stars)),
      variants: [...new Set(l.map((o) => o.variant).filter((v): v is string => !!v))],
      photoIds: l.map((o) => o.photoId),
      firstMs: l.length ? Math.min(...l.map((o) => o.tMs)) : null,
    };
  });
  const speciesFound = entries.filter((e) => e.found).length;
  const title = titleFor(speciesFound);
  const next = TITLES.find((x) => x.species > speciesFound) ?? null;
  return { entries, speciesFound, total: ALL_SPECIES.length, title, nextTitle: next ? { id: next.id, species: next.species } : null };
}
