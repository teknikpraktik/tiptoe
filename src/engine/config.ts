/**
 * Spelets konfigurerbara startvärden för världen, spawn och beteende (spec: "Alla värden ligger i en konfigurationsfil").
 * En ändring här ändrar världen: världens fingeravtryck (src/tests/fixtures/world-fingerprint.txt) uppdateras i samma PR.
 */
export const WORLD = {
  /** Delas av alla telefoner. Byts bara om världen medvetet ska bli en annan. */
  key: "tiptoe-world-v1",
  cellM: 250,
  windowMs: 2 * 60 * 60 * 1000,
  /** Möjliga individer per ruta och tidsfönster (taket per ruta och fönster). */
  candidatesPerCell: 3,
  /** Extra möjliga individer per ruta och fönster inom profilens reservatszoner (reservatsdjur). */
  reserveCandidatesPerCell: 3,
  /** Försök per individ att hitta en säker plats i rutan. */
  placeTries: 8,
} as const;

export const SPAWN = {
  /** Meter gångna per möte (spec: natur 4–7 min, bebyggelse 8–12 min vid ~1,3 m/s). Budgeten växer med 1/meter. */
  metersPerEncounter: { nature: 420, mixed: 560, urban: 780 },
  /** Budgeten sparas inte obegränsat (inga skurar efter en lång sträcka utan djur). */
  maxBudget: 1.5,
  /** Minsta avstånd från spelaren när ett djur dyker upp, och största (så att det går att hitta). */
  minDistM: 60,
  maxDistM: 220,
  /** Gallring av klumpar: inget nytt djur närmare ett annat aktivt än så här. */
  minSpacingM: 50,
  /** Högst så många aktiva djur samtidigt. */
  maxActive: 4,
  /** Djur längre bort än så här från spelaren tas bort (de lever vidare i världen men följs inte). */
  dropDistM: 500,
  /** Djur hålls inom så här långt från en gångbar linje (spec: Nåbarhet). */
  maxFromWalkM: 60,
  /** Sträckan räknas först när spelaren flyttat sig så här långt (m) från förra punkten: GPS-darr ger ingen budget. */
  budgetStepM: 8,
  /** Gräns för fart (m/s) när sträckan räknas: snabbare (cykel, bil) ger ingen budget. */
  maxBudgetSpeedMps: 3.5,
} as const;

export const BEHAVIOR = {
  /** Fast tidssteg (s). */
  stepS: 0.5,
  /** Hur fort oron växer (per s) vid närhet 1 och gångtempo, innan artens flyktbenägenhet. */
  alarmRate: 0.3,
  alarmDecay: 0.08,
  /** Oro över detta = vaksam; 1 = flyr. */
  alertAt: 0.3,
  /** Tempovikt för hur mycket rörelse oroar. Stillastående oroar knappt (spec: Frys!). */
  tempoAlarm: { still: 0.05, sneak: 0.35, walk: 1, run: 2.5 },
  /** Flykt: sträcka (m) innan djuret försvinner (spec: flyende djur försvinner i stället för att springa långt). */
  fleeDistM: [60, 110] as [number, number],
  /** Tomgång: längd på ett moment (s) och hur långt en vandring går (m). */
  idleLegS: [15, 60] as [number, number],
  wanderM: [5, 25] as [number, number],
  /** Hur långt bort (m) ett djur visas på kartan. */
  visibleM: 200,
} as const;
