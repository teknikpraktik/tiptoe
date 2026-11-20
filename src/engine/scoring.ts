import { SPECIES, type SpeciesId } from "./species";

/**
 * Poäng (spec: Poäng, progression och fältdagbok). Totalpoäng = summan av djurpoäng; första fotot av en unik individ ger artens klasspoäng.
 * Areal ger inga poäng. Allt räknas om från sparade observationer.
 */
export interface ScoredObservation { animalId: string; species: SpeciesId; stars: number; tMs: number }

export function pointsForNew(species: SpeciesId, alreadyPhotographed: boolean): number {
  return alreadyPhotographed ? 0 : SPECIES[species].points;
}

export interface ScoreSummary {
  total: number;
  individuals: number;
  species: SpeciesId[];
  /** Bästa betyg per art. */
  bestStars: Partial<Record<SpeciesId, number>>;
}

export function scoreFrom(obs: ScoredObservation[]): ScoreSummary {
  const seen = new Set<string>();
  const species = new Set<SpeciesId>();
  const bestStars: Partial<Record<SpeciesId, number>> = {};
  let total = 0;
  for (const o of [...obs].sort((a, b) => a.tMs - b.tMs)) {
    if (o.stars < 1) continue;
    if (!seen.has(o.animalId)) { seen.add(o.animalId); total += SPECIES[o.species].points; }
    species.add(o.species);
    bestStars[o.species] = Math.max(bestStars[o.species] ?? 0, o.stars);
  }
  return { total, individuals: seen.size, species: [...species], bestStars };
}
