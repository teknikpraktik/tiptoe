// Origin: teknikpraktik/solosurvival@033a121 src/gps/types.ts
export type GPSFix = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  timestampMs: number;
  speedMps?: number | null;
  headingDeg?: number | null;
};

/**
 * Positionskvalitet som spelet agerar på (Tiptoe-anpassning av Outbreaks nivåer, gränser i `@/config/gps`).
 * - ok: bra fix
 * - fair: kameran får användas (bättre än 25 m)
 * - weak: spårpunkten får bygga reservat (bättre än 30 m), men inget foto
 * - poor: positionen visas men används inte för foto eller reservat
 * - unavailable: ingen färsk fix
 */
export type GpsQuality = "ok" | "fair" | "weak" | "poor" | "unavailable";

/** Kameran får användas (spec: GPS-noggrannhet bättre än 25 m vid foto). */
export const canPhotograph = (q: GpsQuality): boolean => q === "ok" || q === "fair";
/** Spårpunkten får användas för reservat (spec: bättre än 30 m). */
export const canTrack = (q: GpsQuality): boolean => q === "ok" || q === "fair" || q === "weak";
