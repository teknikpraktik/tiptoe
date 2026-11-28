import type { SpeciesId } from "@/engine/species";
import type { Ambience } from "./director";

/**
 * Inspelade läten (public/sounds/*.mp3), skapade med ElevenLabs ljudeffekter (fälttest 2: "djurläten, olika fågelkvitter, rådjur, möss").
 * Varje art har ett eget läte med samma namn som arten. Övriga läten är bakgrund: fåglar och möss som hörs då och då under promenaden.
 * Filerna är mono, 64 kbit/s, högst 8 s. Saknas en fil (eller är ljudet inte inläst än) spelas det syntetiska ljudet i stället.
 */
export const BACKGROUND_SAMPLES = ["chaffinch", "great_tit", "robin", "blackbird", "woodpecker", "cuckoo", "crow", "mouse", "owl"] as const;
export type BackgroundSample = (typeof BACKGROUND_SAMPLES)[number];
export type SampleId = SpeciesId | BackgroundSample;

export const sampleUrl = (id: SampleId) => `/sounds/${id}.mp3`;

/** Bakgrundsläten per miljö, dag och natt. Vatten och öppet landskap har färre fåglar; natten har uggla och möss. */
export const BACKGROUND: Record<Exclude<Ambience, "none">, { day: BackgroundSample[]; night: BackgroundSample[] }> = {
  forest: { day: ["chaffinch", "great_tit", "robin", "blackbird", "woodpecker", "cuckoo", "chaffinch", "great_tit", "mouse"], night: ["owl", "mouse", "owl"] },
  urban: { day: ["blackbird", "great_tit", "crow", "robin"], night: ["owl", "blackbird"] },
  open: { day: ["crow", "cuckoo", "chaffinch", "mouse"], night: ["owl", "mouse"] },
  water: { day: ["crow", "blackbird", "chaffinch"], night: ["owl"] },
};
