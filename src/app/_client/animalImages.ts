"use client";

import type { SpeciesId } from "@/engine/species";
import type { AnimalImages } from "./CameraView";

/**
 * Djurbilderna ur public/animals/manifest.json (spec: Bilder av djuren). Riktiga bilder byts in genom att lägga filerna i public/animals/ och
 * uppdatera manifestet; ingen kod behöver ändras. Licensen dokumenteras per art i manifestet.
 */
export interface AnimalManifest { version: number; species: Record<SpeciesId, { views: AnimalImages; license: string; placeholder?: boolean }> }

let p: Promise<AnimalManifest | null> | null = null;
export function animalManifest(): Promise<AnimalManifest | null> {
  p ??= fetch("/animals/manifest.json").then((r) => (r.ok ? (r.json() as Promise<AnimalManifest>) : null)).catch(() => { p = null; return null; });
  return p;
}
