/**
 * Produktens publika namn och varumärkestexter, på ett ställe. SPÅR hette tidigare Tiptoe (arbetsnamn).
 *
 * Skrivregler: SPÅR i logotyp och framträdande element och som produktnamn på engelska; Spår i löpande svensk text. Aldrig SPAR, Spar,
 * Spor eller SPOOR. Interna identifierare (databasnamn, lagringsnycklar, exportformat, världsnyckel, cachenamn, paketnamn) heter
 * fortfarande "tiptoe" och ska INTE bytas: de skyddar spelarnas sparade data och den delade världen.
 */
export const BRAND = {
  /** Logotyp, appnamn, ikonnamn på hemskärmen. */
  name: "SPÅR",
  /** I löpande svensk text. */
  prose: { sv: "Spår", en: "SPÅR" },
  /** Webbläsarens titel. */
  title: "SPÅR – Wildlife Adventure",
  slogan: { sv: "Upptäck djuren. Skapa dina egna spår.", en: "Explore. Discover wildlife. Make your mark." },
  /** Kort beskrivning (manifest, metadata, delning). */
  description: "Upptäck och fotografera vilda djur där du går, och skapa egna naturreservat genom att gå slutna slingor.",
} as const;

/**
 * Filnamn vid delning och export: bara ASCII. Webbläsare (bl.a. Chromium) ignorerar `download`-namn med tecken som Å och sparar då filen
 * som "download". Därför innehåller filnamnen inte produktnamnet, och å/ä/ö skrivs a/a/o.
 */
export function asciiFileName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_");
}
