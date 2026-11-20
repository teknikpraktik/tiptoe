/**
 * GPS-gränser för Tiptoe (spec: "GPS-krav vid foto" och "Validering"). Ersätter Outbreaks GPS_ACCURACY i `@/config/game-rules`.
 * Alla värden är startvärden och kan justeras efter fälttest.
 */
export const GPS_ACCURACY = {
  /** Bra fix. */
  okM: 10,
  /** Sämsta noggrannhet då kameran får användas (spec: bättre än 25 m). */
  photoM: 25,
  /** Sämsta noggrannhet för en spårpunkt som får bygga reservat (spec: bättre än 30 m). */
  trackM: 30,
} as const;

/** Rimlig maxfart för spelaren (m/s). Spec: cirka 12 km/h med tolerans för korta avvikelser; filtret får därför lite marginal. */
export const MAX_PLAUSIBLE_SPEED_MPS = 5;
