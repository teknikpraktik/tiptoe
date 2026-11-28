/**
 * Spelets konfigurerbara startvärden för världen, spawn och beteende (spec: "Alla värden ligger i en konfigurationsfil").
 * En ändring här ändrar världen: världens fingeravtryck (src/tests/fixtures/world-fingerprint.txt) uppdateras i samma PR.
 */
export const WORLD = {
  /** Delas av alla telefoner. Byts bara om världen medvetet ska bli en annan. */
  key: "tiptoe-world-v1",
  cellM: 250,
  windowMs: 2 * 60 * 60 * 1000,
  /** Möjliga individer per ruta och tidsfönster (taket per ruta och fönster). Höjt från 3 efter fälttest 1: områden tog slut på djur. */
  candidatesPerCell: 6,
  /** Extra möjliga individer per ruta och fönster inom profilens reservatszoner (reservatsdjur). */
  reserveCandidatesPerCell: 3,
  /** Försök per individ att hitta en säker plats i rutan. */
  placeTries: 8,
} as const;

export const SPAWN = {
  /**
   * Meter gångna per möte. Budgeten växer med 1/meter. Fälttest 1 (barn): för få djur, så ungefär dubbelt så tätt som specens startvärden
   * (natur ~3 min, bebyggelse ~6 min vid ~1,3 m/s).
   */
  metersPerEncounter: { nature: 230, mixed: 300, urban: 430 },
  /** Budget vid promenadens start: första djuret kommer efter en kort bit. */
  startBudget: 0.8,
  /** Budgeten sparas inte obegränsat (inga skurar efter en lång sträcka utan djur). */
  maxBudget: 2,
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
  /** Sträckan räknas också när stegräknaren säger stilla men GPS-farten är minst så här (stegräknaren missar steg när telefonen hålls stilla). */
  minBudgetSpeedMps: 0.5,
} as const;

export const BEHAVIOR = {
  /** Fast tidssteg (s). */
  stepS: 0.5,
  /** Hur fort oron växer (per s) vid närhet 1 och gångtempo, innan artens flyktbenägenhet. Sänkt efter fälttest 1 (lättare för barn). */
  alarmRate: 0.18,
  alarmDecay: 0.12,
  /** Oro över detta = vaksam; 1 = flyr. */
  alertAt: 0.3,
  /** Tempovikt för hur mycket rörelse oroar. Stillastående oroar knappt (spec: Frys!). */
  tempoAlarm: { still: 0.03, sneak: 0.2, walk: 0.7, run: 2 },
  /** Flykt: sträcka (m) som djuret springer (spec: flyende djur springer inte långt). */
  fleeDistM: [40, 80] as [number, number],
  /** Tomgång: längd på ett moment (s) och hur långt en vandring går (m). */
  idleLegS: [15, 60] as [number, number],
  wanderM: [5, 25] as [number, number],
  /** Hur långt bort (m) ett djur syns på kartan, i realtid (fälttest 2: alla aktiva djur syns; de dyker upp högst 220 m bort). */
  visibleM: 400,
  /** Spåren syns inom detta avstånd till djuret, också när djuret syns (så att de inte försvinner när man går mot det). */
  trailM: 350,
  /** Frys-moment (spec: artspecifikt, 1–3 s blick, med förvarning). Förvarningen är lång nog för att stegräknaren ska hinna se att man stannat. */
  freeze: {
    warnMs: 3000,
    everyS: { common: [35, 60], uncommon: [16, 32], rare: [12, 24], very_rare: [10, 20] } as Record<string, [number, number]>,
    lookS: { common: [1, 2], uncommon: [1.5, 2.5], rare: [2, 3], very_rare: [2, 3] } as Record<string, [number, number]>,
    /** Djuret bryr sig bara om spelaren inom upptäcktsradien (gångtempo) × detta. */
    awareFactor: 1.4,
  },
} as const;

/**
 * Hur lätta djuren är att fånga, per klass (fälttest 2: "lätta djur måste vara lättare, de exklusiva får vara svåra"). Tillämpas på artdatan
 * (`SPECIES`): `photo` multiplicerar fotoavståndet, `detection` upptäcktsradien och `alarm` hur fort oron växer. `freezePenalty` är hur
 * mycket oro det kostar att röra sig när djuret tittar (1 = flyr direkt). `flees` är hur många gånger ett springande djur kan fly innan det
 * försvinner (de första gångerna stannar det en bit bort).
 */
export const EASE = {
  common: { photo: 1.5, detection: 0.7, alarm: 0.5, freezePenalty: 0.35, flees: 3 },
  uncommon: { photo: 1.25, detection: 0.85, alarm: 0.75, freezePenalty: 0.6, flees: 2 },
  rare: { photo: 1, detection: 1, alarm: 1, freezePenalty: 1, flees: 1 },
  very_rare: { photo: 1, detection: 1, alarm: 1, freezePenalty: 1, flees: 1 },
} as const;
