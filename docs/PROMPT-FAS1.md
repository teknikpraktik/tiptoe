# Produktionsprompt för Claude Code – Tiptoe, fas 1

Du är senior utvecklare i projektet **Tiptoe**, en GPS-baserad PWA där spelaren smyger sig nära virtuella vilda djur och fotograferar dem, och bygger reservat genom att gå slutna slingor.

Produktspecifikationen ligger i `docs/SPEC.md` (exporterad från "Tiptoe – Produktspecifikation v1.0"). Läs den i sin helhet innan du börjar. Om specen och den här prompten säger olika saker gäller specen för *vad* som ska byggas och prompten för *hur och i vilken ordning*. Hittar du en motsägelse: stanna och fråga.

Svara och skriv dokumentation på svenska. Kod, identifierare och commit-meddelanden på engelska. All användartext går via i18n.

---

## 1. Ramar som inte får brytas

- **Outbreak ändras aldrig.** Källrepot `teknikpraktik/solosurvival` får bara läsas. Klona det skrivskyddat till en tillfällig katalog *utanför* Tiptoe-repot, på commit `033a121` (eller senaste `master` om den commiten saknas; skriv i så fall vilken commit du använde). Inga commits, pushar, PR:er, issues eller ändringar där.
- **Inget kopieras in utan att det står i kopieringslistan nedan.** Ingen gemensam motor, inga submoduler, inga beroenden mot Outbreak-repot.
- **Ingen deployment till produktion utan godkännande.** Arbeta på grenar och öppna PR mot `main`. Per mergar. Förhandsdeploys från Vercel på PR-grenar är tillåtna.
- **Inga hemligheter, nycklar eller betaltjänster.** Kartor från OpenFreeMap (ingen nyckel). Ingen massnedladdning eller förhämtning av kartrutor; följ deras villkor och visa alltid attributionen.
- **Fas 1 slutar med ett stopp** (se avsnitt 6). Börja inte på fas 2.

## 2. Teknikstack

Next.js som statisk export, React, TypeScript, MapLibre GL, Vitest, `playwright-core` för e2e, GitHub Actions, Vercel. Node 22. Samma versioner som Outbreak där inget annat sägs. Inga API-routes, ingen server. Ingen CSS-ram: en global stilmall som i Outbreak.

Struktur:

```
src/engine/    ren TS: värld, arter, spawn, beteende, upptäckt, poäng (ingen React/MapLibre/DOM)
src/geo/       geometri, reservatsgeometri, miljöuppslag, hinder och farokontroll
src/gps/       provider och filter
src/sensors/   orientering och rörelse (steg/tempo)
src/camera/    kameravy, sammanslagning, betyg
src/storage/   lagringsabstraktion över IndexedDB
src/i18n/      sv + en, typade ordlistor
src/sim/       simulerade promenader för balans
src/app/       Next.js-sidor och klientkomponenter
docs/          SPEC.md, spikrapporter, statusrapporter
```

`src/engine` och `src/geo` ska gå att köra och testa i Node utan webbläsare.

## 3. Kopieringslista från Outbreak

Kopiera, anpassa importvägar och se till att testerna går gröna innan något annat byggs. Lägg en rad överst i varje kopierad fil: `// Origin: teknikpraktik/solosurvival@<commit> <sökväg>`.

**A. Nästan oförändrat**
- `src/geo/geometry/index.ts`
- `src/engine/core/rng.ts`, `src/engine/core/heap.ts`
- `src/gps/types.ts`, `src/gps/provider/provider.ts`, `src/gps/filters/filter.ts`. Ersätt importen av `GPS_ACCURACY` från `@/config/game-rules` med egna konstanter. Felsträngarna flyttas till i18n.
- `src/play/speed.ts`, `src/play/heading.ts`, `src/play/compass.ts` → `src/sensors/`
- `src/play/idb.ts` → `src/storage/idb.ts` med `DB_NAME = "tiptoe"` och lager enligt specen
- `src/geo/mvt.ts`, `src/geo/blockers.ts`, `src/geo/point-check.ts`
- `src/app/_client/Modal.tsx`, `src/app/_client/ServiceWorker.tsx`, `public/sw.js` (byt cachenamn och statiska sökvägar)
- `build-id.mjs`, `scripts/stamp-build.mjs`, `scripts/copy-maplibre-worker.mjs`
- Tester: `gps`, `geo`, `speed`, `heading`, `orientation`, `point-check`, `blockers`, `tiles` (`src/tests/unit/*.test.ts`) samt `src/tests/fixtures/mvt/*.pbf`. Kör dem med `fake-indexeddb` där det behövs.

**B. Kopiera som utgångspunkt och bygg om**
- `src/app/_client/GameMap.tsx`, `src/app/_client/mapStyle.ts`. Behåll kartinitiering, track-up-kamera, DOM-markörer, en enda `requestAnimationFrame`-loop och pausen vid `visibilitychange`. Ta bort lagren `net`, `routes` och `zone`. Ny, ljusare och filmisk palett.
- `src/play/zombie-anim.ts` → djuranimation i fri 2D
- `src/play/recap.ts`, `src/play/storage.ts`. Spår i bitar och ögonblicksbild med återställning. Spara varje godkänd fix med minst cirka 5 m mellan punkterna (inte var 3:e sekund).
- `src/app/_client/SessionProvider.tsx`, `src/play/session.ts`. Bara mönstren: wake lock, `visibilitychange`, `pagehide`, hantering av frånvaro. Matchlogiken kopieras inte.
- `src/engine/core/engine.ts`, `src/engine/spawning/spawn.ts`, `src/engine/ai/culling.ts`. Struktur och koncept.
- `src/app/_client/audio.ts`, `src/audio/cue-player.ts`. Upplåsning av WebAudio och ljudsignaler.
- `src/play/fieldlog.ts` och sidan `/field`. Fältdiagnostik.
- `e2e/geo.mjs` och mönstret i `e2e/*.mjs` (mockad GPS). `.github/workflows/ci.yml`, förenklad till ett jobb: typecheck, lint (`tsc --noEmit --noUnusedLocals --noUnusedParameters`), test, build.

**D. Kopiera inte**
Zombie-AI, roller, infektion, extraktion, mål, rutter, kampanjer, skrämmor, Outbreaks ljud- och bildfiler, typsnitt du inte använder, `apps/mini`, `experiments/`, `public/data/v1`, `@elevenlabs/elevenlabs-js`.

## 4. Fas 1: arbetsordning

Arbeta i den här ordningen. Varje steg är en egen PR med gröna tester.

### Steg 1: Grund
Repo-struktur, `package.json`, TypeScript-konfiguration, Vitest, CI, PWA-manifest (`name: "Tiptoe"`, `id: "/"`), service worker, i18n-skelett (sv standard, en komplett för det som finns), kopierade A-moduler med gröna tester. En startsida och en kartsida som visar spelarens position.

### Steg 2: Spik 1 – kamera på iPhone
Mål: avgöra 2D eller 3D och bevisa att kedjan fungerar i en **installerad** PWA på iPhone.
- Kameravyn är ett överlägg på samma route, aldrig en navigering (iOS återkallar annars kameran i fristående läge).
- Bakre kameran via `getUserMedia`. Stoppa spåren när vyn stängs. Hantera svart ström efter bakgrund genom att begära om.
- Ett 2D-utklipp (platshållare med transparent bakgrund) placerat efter bäring, förankrat med `DeviceOrientation` (behörighetsfrågan på iOS hanteras som i `compass.ts`).
- Sammanslagning: `drawImage` av videon och sedan utklippet med kontaktskugga, gemensam färgsättning, lätt kornighet och vinjett, i en canvas; `toBlob` som JPEG.
- Spara som Blob i IndexedDB. Dela eller spara till Bilder via Web Share API med filer, med nedladdning som reserv.
- Jämförelse: samma flöde med en statisk glTF-modell i Three.js (lazy-laddad). Mät bildfrekvens, laddtid och minne.
- Leverera `docs/SPIKE-1-KAMERA.md`: vad som fungerade på iPhone (ange modell och iOS-version om Per testar) och Android, kända buggar, rekommendation 2D eller 3D med motivering, och en testlista som Per kan gå igenom på sin telefon.

### Steg 3: Spik 2 – reservatsgeometri
Mål: robust "buffra och fyll" enligt specen.
- Ren funktion i `src/geo/reserves/`: indata är ett filtrerat spår och befintliga reservat; utdata är nya reservat, tillagd yta och sammanslagningar.
- Arbeta i lokala metriska koordinater (`toLocal`/`fromLocal`). Förenkla spåret (cirka 5 m). Buffra med en konfigurerbar halv slutningstolerans (start 15–20 m) och slå ihop med befintliga reservat. Inre hål ≥ 0,1 ha blir ny yta.
- Hantera glapp under 50 m (överbrygga) och längre glapp (bryt), självkorsningar, återanslutning till befintlig gräns, flera reservat som växer ihop, och ett tak för ny yta per promenad.
- Jämför Clipper2 (`clipper2-js`) med Turf/JSTS: korrekthet på fixturerna, buntstorlek och tid på en medelstark telefon.
- Fixturer: syntetiska (kvadrat, nästan sluten slinga, åtta, utstickare, GPS-hopp, brus ±10 m) och, om Per lämnar sådana, riktiga spår.
- Leverera `docs/SPIKE-2-GEOMETRI.md` med valt bibliotek, mätvärden och kända begränsningar.

### Steg 4: Deterministisk värld och djur (smal)
- Rutor 250 × 250 m och tidsfönster 2 h (konfigurerbara). Seed = hash(ruta, fönster, världsnyckel). Individ-ID = hash(seed, löpnummer). Samma indata ger samma djur på alla enheter.
- Miljö ur vektortiles: `landcover` (wood, grass, wetland), `park`, `landuse`, `water`. Utöka `mvt.ts`.
- Fem arter: ekorre, rådjur, rödräv, grävling, älg. Artdata i `src/engine/species.ts` enligt specens tabell (klass, poäng, miljövikter, aktiv tid, hastigheter, upptäcktsradie, flyktbenägenhet, fotoavstånd).
- Spawnbudget per gången sträcka, inte per tid. Inget spawnar när spelaren står still. Tak per ruta och fönster. Minsta avstånd 60 m. Spawn bara inom 60 m från en gångbar linje och aldrig där `point-check` hittar vatten, byggnad, större väg eller järnväg.
- Beteende: tillstånd vila, beta, vandra, vaksam, flyr, försvinner. Fri 2D-rörelse som aldrig går in i spärrade ytor. Lat simulering vid observation.
- Upptäckt: artens radie × tempofaktor (stilla 0,4, smyg 0,7, gång 1,0, spring 1,6). Tempot från `DeviceMotion` (steg), med GPS-fart bara som reserv. Använd filtrerad position.
- Balanssimulator i `src/sim/` som går syntetiska promenader genom olika miljöer och rapporterar möten per minut. Målet för fas 1 är ett möte per 5–10 minuter i blandad miljö.

### Steg 5: Spelloopen (smal)
- Starta promenad och avsluta promenad. Kartan visar spår, reservat och synliga djur. Wake lock under promenad.
- Kameraknapp inom fotoavstånd; kräver att spelaren står still. Kameraflödet från spik 1.
- Fotobetyg 1–3 stjärnor: avstånd i förhållande till artens fotoavstånd, inramning och om djuret är lugnt. Poäng för första fotot av en individ.
- Reservat från spik 2, utan nivåeffekter. Visa yta och hektartal med animation när en slinga sluts.
- En profil, svenska, lokal lagring som överlever omstart.

### Steg 6: Fälttestversion
- Sidan `/field` med GPS-kvalitet, lagring (`navigator.storage.estimate`), `persist()`-status, wake lock-stöd, sensortillstånd och exporterbar logg (möten, flykt, reservat, kamerafel).
- Uppmaning att installera appen före första promenaden, och varning i Safari-läge.
- Felsökningsläge bakom `localStorage["tiptoe.debug"]="on"`.

## 5. Kvalitetskrav

- Ren logik (`engine`, `geo`, `gps`, `storage`) testas med Vitest. Deterministiska tester med fast seed.
- Ett regressionsfingeravtryck för världen: samma rutor och fönster ger samma lista av individer. Avsiktliga ändringar uppdaterar referensfilen i samma PR.
- E2e med mockad GPS för: starta promenad, gå en slinga, se ett reservat, närma sig ett djur, ta ett foto, starta om, data finns kvar.
- Kör `typecheck`, `lint`, `test` och `build` före varje PR. Ingen PR med röda tester.
- Allt som rör batteri ska vila när sidan är dold: rAF-loop, sensorer, kamera.
- Ingen användartext hårdkodad utanför i18n.

## 6. Stopp efter fas 1

När steg 1–6 är klara, eller om du kör fast på något som kräver ett produktbeslut:

1. Skriv `docs/STATUS-FAS1.md`: vad som är byggt, vad som inte är det, avvikelser från specen och varför, kända buggar, mätvärden från simulatorn, och en fälttestlista för Per (iPhone och Android, installerad PWA, en promenad på 30–45 minuter i blandad miljö).
2. Kontrollera acceptanskriterierna för fas 1 i specen ett i taget och markera vart och ett som uppfyllt, delvis uppfyllt eller inte uppfyllt, med belägg.
3. **Vänta på godkännande.** Påbörja inte fas 2.

## 7. Arbetssätt

- Små, avgränsade PR:er med beskrivning av vad som ändrats och hur det testats.
- Fråga hellre än gissa när ett beslut påverkar spelmekanik, säkerhet för barn eller lagringsformat.
- Avvik inte från specen i tysthet. Skriv avvikelser i PR-beskrivningen och i statusrapporten.
- Rör aldrig Outbreak.
