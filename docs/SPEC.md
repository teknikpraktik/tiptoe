# Tiptoe – Produktspecifikation v1.0

Nov 20, 2026 · @Per

## Sammanfattning

Tiptoe är en GPS-baserad PWA där spelaren smyger sig nära virtuella vilda djur och fotograferar dem, och bygger reservat genom att gå slutna slingor. Stora reservat i rätt miljö lockar sällsyntare djur. Endast djur ger poäng.

Utvecklingen sker i två faser med ett stopp emellan: först två tekniska spikar och ett smalt fälttest, sedan full MVP. Eget repo `teknikpraktik/tiptoe`, egen Vercel-deployment. Outbreak ändras aldrig.

### Låsta beslut

| Område | Beslut |
| --- | --- |
| Namn | Tiptoe. Repo `teknikpraktik/tiptoe`, Vercel-projekt `tiptoe`, IndexedDB-prefix `tiptoe` |
| Marknad | Sverige först, möjligen kommersiellt. Svenska som standard, engelska komplett |
| Användare | Både barn med egen telefon och familjer med delad telefon |
| Poäng | Bara djur ger poäng. Reservatens areal visas och summeras men ger inga poäng |
| Reservat och djur | Reservatets storlek styr sällsynthet (nivåer), inte antal möten. Effekten gäller i eller nära reservatet |
| Miljö | Miljön (skog, park, våtmark, vatten, bebyggelse) styr vilka arter som kan dyka upp. Spelet nudgar mot natur men har ett golv av möten överallt |
| Vatten | Inga djur på vattenytor. Vattenarter i en zon på land nära vatten. Utter och bäver kan dyka undan |
| Delad värld | Djurindivider seedas deterministiskt per plats och tid, så att två telefoner ser samma djur utan server. Fotostatus sparas per profil |
| AR | 2D-utklipp med gyroförankring som standard. 3D avgörs i spik |
| Glapp i slingan | Glapp under cirka 50 m överbryggas. Slingan kan också fångas mot befintlig reservatsgräns |
| Förbättringsförslag | Alla tio ingår i MVP (se Kärnloop och Poäng) |
| Djurbilder | AI-genererade fotorealistiska utklipp med rätt till kommersiellt bruk |
| Föräldralås | Inget lås. Hemområdet är en inställning per profil |
| Utveckling | Fas 1: spikar och fälttest. Stopp för granskning. Fas 2: full MVP |

## Produktvision

Tiptoe ska kännas som ett äventyrsspel med puls och uptäckarlust, inte som en pedagogisk naturapp. Kärnverbet är *smyg dig nära innan det flyr*.

- **Målgrupp:** barn från cirka 8 år, familjer, ungdomar och vuxna som gillar GPS-spel och samlande.
- **Ton:** filmisk, lite mystisk, äventyrlig. Fotorealistiska djur. Inte gulligt, ingen skolbokston, inga miljöpolitiska budskap.
- **Undertitel (förslag):** "Tiptoe – Wild Encounters". Spelarens roll inne i spelet är *ranger* i sina egna reservat.
- **Ingen våld och ingen jakt.** Kameran är det enda verktyget.

Spelaren ska tänka: Vad rör sig där borta? Hinner jag nära innan det flyr? Var håller lodjuret till? Hur stort måste mitt reservat bli för att havsörnen ska komma?

## Kärnloop och spelmekanik

En session börjar med **Starta promenad** och slutar med **Avsluta**. Under promenaden pågår allt nedan parallellt; GPS kräver att appen är öppen och skärmen tänd.

1. **Gå.** Sträckan driver djurgenereringen. Miljön runt spelaren avgör vilka arter som kan dyka upp.
2. **Hör och upptäck.** Ljud (prassel, varningsläte, knäckt kvist) med ungefärlig riktning kommer före synen. Spår på kartan kan leda mot ett djur.
3. **Smyg.** Djurets upptäcktsradie beror på spelarens tempo: stillastående < smygande < gång < springande. Tempot mäts med telefonens rörelsesensor (steg), inte med GPS-fart.
4. **Frys!** Djuret lyfter ibland huvudet och tittar. Rör sig spelaren då flyr det.
5. **Fotografera.** Inom fotoavstånd blir kameraknappen aktiv. Spelaren måste stå still. Avståndet styr teleobjektivets zoom och bildens kvalitet.
6. **Betyg.** Fotot får 1–3 stjärnor. Första fotot av en individ ger poäng.
7. **Bygg reservat.** Slutna slingor blir reservat. Ett nytt reservat får direkt en inflyttad individ, så att belöningen kommer omedelbart.
8. **Kom tillbaka.** Större reservat i rätt miljö ger tillgång till sällsyntare arter. Dygnets tid ändrar vilka arter som är aktiva.

### Startparametrar (alla konfigurerbara)

| Parameter | Startvärde |
| --- | --- |
| Möten i natur | ett per 4–7 min aktiv promenad |
| Möten i bebyggelse | ett per 8–12 min |
| Upptäcktsradie | artspecifik bas × tempofaktor (stilla 0,4 · smyg 0,7 · gång 1,0 · spring 1,6) |
| Fotoavstånd | artspecifikt, typiskt 15–40 m |
| Frys-moment | artspecifikt, 1–3 s blick, med förvarning via ljud/animation |
| GPS-krav vid foto | noggrannhet bättre än 25 m |

### Fotobetyg

Tre stjärnor räknas fram ur: avstånd i förhållande till artens fotoavstånd, inramning (djuret nära bildens mitt och helt i bild) och djurets tillstånd (lugnt, inte flyende). Betyget sparas per foto. Bästa betyg per art visas i fältdagboken.

## Reservat

Ett reservat är den yta en sluten slinga innesluter, sammanslagen med spelarens befintliga reservat. Reservat ger inga poäng; deras storlek och miljö styr vilka djur som kan finnas där.

### Geometri: "buffra och fyll"

1. Filtrera GPS-spåret (Outbreaks `GpsFilter`) och förenkla det (Douglas–Peucker cirka 5 m).
2. Projicera till lokala metriska koordinater (`toLocal`).
3. Buffra spåret med halva slutningstoleransen (start 15–20 m) och slå ihop med spelarens befintliga reservat.
4. Varje inre hål i resultatet är innesluten yta. Hål ≥ 0,1 ha läggs till reservaten, tillsammans med den del av korridoren som ligger runt hålet.
5. Slå ihop med befintliga reservat. Reservat som växer ihop blir ett. Areal räknas på den sammanslagna ytan, så inget dubbelräknas.

Metoden hanterar nästan slutna slingor, självkorsningar, återanslutning till befintlig gräns och sammanslagning i samma operation. Bibliotek väljs i spik 2 (kandidat: Clipper2 via `clipper2-js`, alternativ: Turf/JSTS).

### Validering

| Regel | Startvärde |
| --- | --- |
| GPS-noggrannhet för spårpunkter | bättre än 30 m |
| Maxfart | cirka 12 km/h med tolerans för korta avvikelser |
| Minsta nya yta | 0,1 ha |
| Glapp som överbryggas | under 50 m och tidsmässigt rimligt; annars bryts spåret |
| Max ny yta per promenad | konfigurerbart tak (start 50 ha), skydd mot GPS-fel |

### Reservatsnivåer

Nivån bestäms av reservatets totala areal och gäller inne i reservatet och i en zon runt det (start 100 m).

| Nivå | Areal | Effekt |
| --- | --- | --- |
| 0 | under 1 ha | ingen skillnad |
| 1 | 1–5 ha | ovanliga arter oftare |
| 2 | 5–20 ha | sällsynta arter kan slå sig ner och hittas igen |
| 3 | över 20 ha | mycket sällsynta arter blir möjliga |

Nivån påverkar sällsynthet, inte antal möten. Kartan visar nivån och vad som krävs för nästa ("Reservatet räcker nu för lodjur").

### Direkt återkoppling

När en slinga stängs: ytan växer fram med animation och hektartal, och en individ flyttar in i det nya området med ett garanterat möte. Total areal visas i profilen som rekordsiffra.

Reservaten innebär inte verkligt naturskydd eller äganderätt. Alla marktyper får ingå.

## Djur och spelvärld

MVP:n har 15 svenska arter i fyra sällsynthetsklasser. Miljön styr vilka arter som kan dyka upp, reservatsnivån styr hur sällsynta, och dygnets tid styr vilka som är aktiva. Alla värden ligger i en konfigurationsfil.

### Arter (startvärden)

| Art | Klass | Poäng | Miljö | Aktiv | Krav |
| --- | --- | --- | --- | --- | --- |
| Ekorre | vanlig | 50 | skog, park, bebyggelse | dag | – |
| Skogshare | vanlig | 50 | skog, gräs, åker | skymning, dag | – |
| Rådjur | vanlig | 50 | skogsbryn, åker, park | skymning, dag | – |
| Rödräv | vanlig | 50 | alla, även bebyggelse | dygnet runt | – |
| Igelkott | vanlig | 50 | park, villaområde | skymning, natt (sällsynt dag) | – |
| Grävling | ovanlig | 100 | skog, skogsbryn | skymning | – |
| Bäver | ovanlig | 100 | nära vatten | skymning | vattenzon |
| Vildsvin | ovanlig | 100 | skog, åker | skymning | – |
| Älg | ovanlig | 100 | skog, våtmark | skymning, dag | – |
| Tjäder | sällsynt | 250 | barrskog | gryning, dag | – |
| Utter | sällsynt | 250 | nära vatten | skymning | vattenzon |
| Lodjur | sällsynt | 250 | skog | skymning | – |
| Varg | mycket sällsynt | 1 000 | stora skogar | skymning | reservatsnivå 3 |
| Brunbjörn | mycket sällsynt | 1 000 | skog | dag, skymning | reservatsnivå 3 |
| Havsörn | mycket sällsynt | 1 000 | nära stora vatten | dag | reservatsnivå 3 eller sällsynt observation |

Sällsynta arter kan dyka upp med låg sannolikhet utanför reservat och oftare i nivå 2. Mycket sällsynta kräver nivå 3, förutom havsörn som även kan annonseras som en *observation* i närheten.

### Miljö

Miljön slås upp i samma vektortiles som kartan (OpenFreeMap, OpenMapTiles-schema): `landcover` (wood, grass, wetland), `park`, `landuse` (residential m.fl.) och `water`. Varje art har en vikttabell per miljö. Ingen avancerad habitatmodell.

- **Golv:** vanliga arter finns överallt där miljön tillåter, även i stan.
- **Nudge:** svag skuggning av "levande" miljöer på kartan, ljudtips mot närliggande natur och enstaka observationer av sällsynta arter. Tips respekterar profilens hemområde.
- **Utflykter:** vissa arter (t.ex. havsörn) får kräva en resa. Vanliga och ovanliga arter ska gå att hitta nära hemmet.

### Vatten

- Inget djur har vatten som tillåten position; vatten är spärrat (återanvänd `blockers.ts`).
- Vattenarter (bäver, utter, havsörn) placeras i en zon på land: minst 10–15 m och högst 100 m från större vatten.
- Utter och bäver får fly mot vatten och försvinner med ett plask vid zonens inre gräns ("dyker undan").
- Havsörnen sitter högt (död trädtopp, stenblock) och flyr genom att lyfta. Lyftet är en animation, ingen rörelse över vatten.
- Is ligger i vattenpolygonen och är därmed alltid spärrad.

### Deterministisk värld

Basvärlden är gemensam för alla telefoner utan server.

- Världen delas i rutor (start 250 × 250 m) och tidsfönster (start 2 h).
- Seed = hash(ruta, tidsfönster, världsnyckel). Samma ruta och fönster ger samma individer, samma ID och samma startpositioner på alla enheter.
- Individ-ID = hash(seed, löpnummer). Fotostatus sparas per profil.
- Individer som *flyttar in i ett reservat* är per profil, eftersom reservaten är per profil. Syskon ser samma basdjur men var sina reservatsdjur.
- Rörelser framåt i tiden simuleras lat vid observation (inga bakgrundsberäkningar).

### Generering

- Budget per gången sträcka (inte per tid), justerad mot mötesmålen ovan. Stillastående genererar inget.
- Tak per ruta och tidsfönster, och färskhet per ruta (nyligen besökt ruta ger färre nya individer).
- Minsta spawnavstånd från spelaren (start 60 m) och gallring av klumpar (som Outbreaks `culling.ts`).
- Spawn bara på platser som klarar säkerhetskontrollen (se Säkerhet för barn) och inom 60 m från en gångbar linje.

### Beteende

Varje art har hastigheter, upptäcktsradie, flyktbenägenhet, frys-frekvens och vilomönster. Tillstånd: vila → beta → vandra → vaksam → tittar (frys-moment) → flyr → försvinner.

- Fri rörelse i 2D, aldrig in i byggnader, vatten, större vägar eller järnväg.
- Flykt bort från spelaren, viktad mot närmaste skydd (skog), och hålls inom nåbart avstånd från gångbara linjer.
- Upptäckt använder filtrerad position och tempo, inte rå GPS, så att GPS-brus inte skrämmer djur av sig själv.
- Vanliga djur försvinner och ersätts ofta; sällsynta lever längre. Inflyttade reservatsdjur kan hittas igen.

## Kamera och fotografering

Standardlösningen är fotorealistiska 2D-utklipp ovanpå den riktiga kamerabilden, förankrade med gyro och teleobjektivlook. 3D med Three.js provås i spik 1 och väljs bara om det fungerar stabilt på iPhone. WebXR med AR används inte, eftersom iOS inte stöder det.

### Flöde

1. Inom fotoavstånd blir kameraknappen aktiv. Spelaren måste stå still.
2. Kameravyn öppnas som ett **överlägg på samma route**, aldrig via navigering (iOS-buggar återkallar kameran vid routebyte i fristående PWA).
3. Djurets riktning i kameran = dess faktiska bäring från spelaren. Gyrot (`DeviceOrientation`, återanvänd `compass.ts`) håller djuret kvar när man panorerar.
4. Avståndet på kartan styr zoom och skärpa. Spelaren kan justera djurets vertikala position.
5. Avtryckaren slår ihop videobild och djur i en canvas (`drawImage` av video, sedan utklippet med skugga och färgsättning) och sparar med `toBlob` som JPEG.
6. Spelaren får betyget direkt (1–3 stjärnor) och ser fotot.

### Bilder av djuren

- AI-genererade fotorealistiska utklipp med rätt till kommersiellt bruk. Licensvillkoren dokumenteras per bild.
- Per art: minst tre vinklar (framifrån, sidan, bakifrån) och två poser (lugn, vaksam). Vinkeln väljs efter djurets riktning relativt spelaren.
- Enhetlig stil: samma ljus, objektivkänsla och upplösning. Transparent bakgrund (WebP eller PNG).
- Fas 1 använder platshållare där bilder saknas.

### Look och realism

En filmisk teleobjektiv- eller viltkameralook döljer att bilden är sammanfogad: lätt kornighet, vinjett, gemensam färgsättning över kamera och djur, enkel kontaktskugga och lätt oöskärpa på avstånd.

### Spara och dela

- Bilden sparas som Blob i IndexedDB. Canvas tar bort EXIF, så ingen position följer med.
- Spara till telefonens bilder och dela görs via Web Share API med filer, där iOS erbjuder "Spara bild". Reserv: nedladdning.
- Mål för filstorlek: cirka 300–600 kB per foto.

## Poäng, progression och fältdagbok

Totalpoäng = summan av djurpoäng. Poängen ska alltid kunna räknas om från sparade observationer.

### Poäng

- Första fotot av en unik individ ger artens klasspoäng (50 / 100 / 250 / 1 000).
- Fler foton av samma individ ger inga poäng men kan förbättra bästa betyg.
- Areal ger inga poäng. Total areal och antal reservat visas i profilen.
- Inga valutor, köp, achievements eller uppdrag.

### Progression (enkel)

- **Arträknare:** "11/15 arter" i fältdagboken.
- **Titlar efter dagboken:** t.ex. Spårare (3 arter), Ranger (8), Mästerranger (alla 15). Exakta trappsteg i konfigurationen.
- **Varianter:** sällsynta utseenden hos individer (stor älgtjur, mörk räv) markeras i dagboken.
- **Reservatsnivåer:** syns på kartan med nästa mål.

### Fältdagbok

Per profil, grupperad per art. Spelaren kan:

- se upptäckta arter och vilka som saknas (silhuett),
- se antal fotograferade individer per art och bästa betyg,
- bläddra bland alla foton och öppna dem i större format,
- spara eller dela foton via delningsmenyn.

## UX, ljud och visuellt uttryck

Kartan är spelet; allt annat är ett tryck bort. Minimal text, inga menyträd, inget överlastat HUD.

### Skärmar

1. **Start:** välj profil, Starta promenad, Fältdagbok, Inställningar.
2. **Promenad (karta):** spelarens pil, eget spår, reservat med nivå, synliga djur, ljud- och spårtips, minimal statusrad (GPS-kvalitet, tempo-indikator för smyg).
3. **Kameravy:** överlägg med avtryckare, zoomindikator och stå-still-varning.
4. **Resultat:** fotot, stjärnor, poäng och "ny art!" vid första fyndet.
5. **Fältdagbok** och **Inställningar** (språk, ljud, hemområde, export/import, profiler).

### Visuellt

- Filmisk, lätt mystisk palett. Ljusare och varmare än Outbreaks skräckstil.
- Fotorealistiska djur i kameran och på resultatskärmen. På kartan diskreta markörer, inte tecknade figurer.
- Tydlig återkoppling: reservat som växer fram, kort feststund vid ny art, särskild markering för sällsynta.

### Ljud

- Närhetsljud när ett djur kommer inom hörrådd (prassel, kvist, varningsläte), med panorering för ungefärlig riktning. En gång per individ, cooldown och gruppering som i Outbreak.
- Frys-moment förvarnas med ett tydligt ljud.
- Ambient miljöljud efter miljö (skog, vatten, stad), låg volym.
- Ljud följer telefonens tyst-läge. Spelet ska gå att spela utan ljud.

## Säkerhet för barn

Spelet får aldrig kräva att spelaren går in på farliga eller otillgängliga platser. Det gäller även när ett barn spelar ensamt.

- **Inga djur nära faror:** spawn, vila och flykt undviker vatten, byggnader, större vägar (motorway till tertiary, med marginal cirka 12 m) och järnväg. Återanvänd `point-check.ts`.
- **Nåbarhet:** djur hålls inom 60 m från gångbara linjer.
- **Vatten:** vattenarter fotograferas från land med minst 10–15 m till kanten. Aldrig is, bryggor eller strandsten.
- **Stå still för att fotografera.** Kameravyn stängs om spelaren börjar gå.
- **Titta upp:** påminnelse när spelaren rör sig med blicken i skärmen länge. Ljudtips gör att man kan hålla blicken uppe.
- **Hemområde:** valfri radie per profil (standard 1 km för barnprofil). Nudgar och observationer pekar bara inom området. Inget föräldralås; inställningen kan ändras av den som håller telefonen.
- **Ingen jakt efter fläktande djur:** flyende djur försvinner i stället för att springa långt.
- **Integritet:** ingen server, inga konton, ingen position i fotofiler. Exportfiler innehåller GPS-spår och varnas för vid delning.

## Profiler, språk och lagring

All data ligger lokalt i IndexedDB bakom ett lagringsabstraktionslager, så att en server kan läggas till senare utan omskrivning.

### Profiler

Flera lokala profiler per telefon, utan inloggning. Varje profil har eget namn och ID, typ (barn eller vuxen), språk, hemområde, reservat, observationer, foton, fältdagbok och poäng. Basvärldens djur delas; fotostatus och reservatsdjur är per profil.

### Språk

Svenska och engelska från start. Automatisk identifiering vid första start, manuellt val per profil. All användartext ligger i typade ordlistor (inget tungt i18n-bibliotek).

### Lagring

| Lager | Innehåll |
| --- | --- |
| `profiles` | profiler och inställningar |
| `walks` | promenader och GPS-spår i bitar |
| `reserves` | reservatsgeometrier per profil |
| `observations` | foton-metadata, individ-ID, betyg, tid, plats |
| `photos` | bild-Blobs |
| `world` | lokalt tillstånd för individer (lata uppdateringar, reservatsdjur) |
| `tiles` | cachade vektortiles för miljö och hinder |
| `meta` | schemaversion, diagnostik |

- **Installation före spel:** en installerad PWA på iOS får en egen lagringsbehållare skild från Safari. Appen uppmanar till installation innan första promenaden och varnar i Safari-läge.
- Anropa `navigator.storage.persist()` och visa lagringsanvändning.
- Tydlig varning om dataförlust vid rensning av webbläsardata, och påminnelse om export.

### Export och import

- En komplett profil, inklusive foton, exporteras som en versionsmärkt zip-fil (manifest med schemaversion, JSON-data och bilder).
- Import valideras mot schemat, visar innehållet och skriver aldrig tyst över befintliga data: välj ny profil eller ersätt efter bekräftelse.
- Delning av exportfil via Web Share API eller nedladdning.

## Teknisk arkitektur

Samma stack som Outbreak: Next.js som statisk export, React, TypeScript, MapLibre GL, Vitest, Playwright (`playwright-core`), GitHub Actions och Vercel. Ingen server, inga API-routes. Utvalda filer kopieras från Outbreak (`teknikpraktik/solosurvival`, commit `033a121`) och utvecklas sedan oberoende. Outbreak ändras aldrig.

### Moduler

- `src/engine/` – ren TypeScript utan React: värld, arter, spawn, beteende, upptäckt, poäng. Fast tidssteg, seedad RNG, körbar i Node.
- `src/geo/` – geometri, reservatsgeometri, miljöuppslag, hinder och farokontroll ur vektortiles.
- `src/gps/` – provider och filter.
- `src/sensors/` – orientering (gyro/kompass) och rörelse (steg/tempo).
- `src/camera/` – kameravy, sammanslagning, betyg.
- `src/storage/` – abstraktionslager över IndexedDB, export/import.
- `src/i18n/` – svenska och engelska ordlistor.
- `src/app/` – Next.js-sidor och klientkomponenter.
- `src/sim/` – simulerade promenader för balans (mötesfrekvens per sträcka och miljö).

### Återanvändning från Outbreak

| Kategori | Filer i Outbreak | Anpassning |
| --- | --- | --- |
| A. Kopiera nästan oförändrat | `src/geo/geometry/index.ts`, `src/engine/core/rng.ts`, `src/engine/core/heap.ts` | ingen |
| A | `src/gps/types.ts`, `src/gps/provider/provider.ts`, `src/gps/filters/filter.ts` | egna konstanter i stället för `GPS_ACCURACY`, felsträngar till i18n |
| A | `src/play/speed.ts`, `heading.ts`, `compass.ts` | ingen |
| A | `src/play/idb.ts` | nya `DB_NAME` och `STORES` |
| A | `src/geo/mvt.ts`, `blockers.ts`, `point-check.ts` | lägg till miljölager |
| A | `src/app/_client/Modal.tsx`, `ServiceWorker.tsx`, `public/sw.js`, `build-id.mjs`, `scripts/stamp-build.mjs`, `scripts/copy-maplibre-worker.mjs` | cachenamn och sökvägar |
| A | tester: `gps`, `geo`, `speed`, `heading`, `orientation`, `point-check`, `blockers`, `tiles` + `src/tests/fixtures/mvt/*.pbf` | importvägar |
| B. Kopiera men bygg om | `src/app/_client/GameMap.tsx`, `mapStyle.ts` | behåll kartinitiering, track-up, DOM-markörer, rAF-loop; nya lager och palett |
| B | `src/play/zombie-anim.ts` | djuranimation i fri 2D |
| B | `src/play/recap.ts`, `storage.ts` | spår i bitar, ögonblicksbild och återställning; tätare sampling |
| B | `src/app/_client/SessionProvider.tsx`, `src/play/session.ts` | mönster för wake lock, synlighet, `pagehide`, frånvaro |
| B | `src/engine/core/engine.ts`, `spawning/spawn.ts`, `ai/culling.ts` | struktur och koncept, nytt innehåll |
| B | `src/app/_client/audio.ts`, `src/audio/cue-player.ts` | WebAudio och ljudsignaler; närhetslogik |
| B | `src/play/fieldlog.ts` + `/field` | fältdiagnostik |
| B | `src/sim/*`, `scripts/balance-*.ts`, `e2e/*.mjs`, `e2e/geo.mjs`, `.github/workflows/ci.yml` | balanssimulator, e2e med mockad GPS, CI |
| D. Återanvänd inte | zombie-AI, roller, infektion, extraktion, mål, rutter, kampanjer, skrämmor, ljud- och bildfiler, `apps/mini`, `experiments/`, Värmlandsdata | – |

Allt annat är nytt (kategori C): reservatsgeometri, deterministisk värld, arter och beteende, smyg och sensorer, kamera och sammanslagning, betyg, fältdagbok, profiler, i18n, export och import.

### Beroenden

Körtid: `next`, `react`, `react-dom`, `maplibre-gl`, ett polygonbibliotek (beslut i spik 2), ett zip-bibliotek (t.ex. `fflate`). `three` endast om 3D väljs, lazy-laddat. Utveckling: `typescript`, `vitest`, `fake-indexeddb`, `playwright-core`, `tsx`. Inte `@elevenlabs/elevenlabs-js`.

### Kartdata

OpenFreeMap-tiles (ingen nyckel). Attribution visas alltid. Ingen massnedladdning eller förhämtning av kartrutor enligt deras villkor; vektortiles för miljö och hinder hämtas bara runt spelaren och cachas lokalt.

## Faser och acceptanskriterier

Fas 1 ska ge ett spelbart smalt test i fält inom cirka 4 veckor. Därefter är det stopp tills Per har granskat och fälttestat. Fas 2 bygger full MVP.

### Fas 1: grund, spikar och smal vertikal skiva

1. **Grund:** repo-struktur, kopierade A-moduler med tester gröna, CI (typecheck, lint, test, build), PWA-skal, Vercel-deployment av huvudgrenen.
2. **Spik 1, kamera på iPhone:** kameravy som överlägg i installerad PWA, gyroförankrat 2D-djur, sammanslagen bild, delning till Bilder. Jämför med en statisk 3D-modell i Three.js. Rapport med rekommendation.
3. **Spik 2, reservatsgeometri:** buffra-och-fyll mot riktiga och syntetiska spår, jämförelse av polygonbibliotek, prestanda på telefon. Rapport med rekommendation.
4. **Smal skiva:** promenad med karta, 5 arter (ekorre, rådjur, rödräv, grävling, älg) med platshållarbilder, deterministisk spawn, smyg med tempo, foto med betyg, reservat utan nivåeffekter, en profil, lokal lagring, svenska.
5. **Fälttestversion** med diagnostiksida (`/field`) och exporterbar logg.

| Fas 1 är klar när | Mätning |
| --- | --- |
| Kameravyn öppnas och fotograferar i installerad PWA på iPhone och Android | manuellt test, protokoll |
| Djuret ligger kvar i bilden vid panorering ±45° | manuellt test |
| En sluten slinga runt ett kvarter ger rätt areal inom ±10 % | testfixturer och fält |
| Nästan sluten slinga (glapp ≤ 30 m) sluts; glapp ≥ 80 m sluts inte | enhetstester |
| GPS-hopp skapar ingen orimlig areal | enhetstester med brusiga fixturer |
| Samma plats och tid ger samma djur på två telefoner | test + fält |
| Ett möte per 5–10 min i blandad miljö | balanssimulator + fält |
| Inga djur på vatten, byggnad, större väg eller järnväg | enhetstester mot tile-fixturer |
| Data finns kvar efter omstart av appen | e2e |

**Stopp.** Claude Code levererar spikrapporterna och en kort statusrapport och väntar på godkännande.

### Fas 2: full MVP

Alla 15 arter med AI-genererade bilder, reservatsnivåer och inflyttning, miljövikter och vattenzoner, frys-moment, närhetsljud och ambient ljud, spår på kartan, tid på dygnet, observationer, fältdagbok med titlar och varianter, flera profiler, hemområde, engelska, export och import, installationsflöde och lagringsvarningar.

| Fas 2 är klar när | Mätning |
| --- | --- |
| Alla funktioner i specen finns och är täckta av enhetstester där logiken är ren | CI |
| Export → rensa → import återställer en profil med foton exakt | e2e |
| Poäng räknas om identiskt från sparade observationer | enhetstest |
| Batteriförbrukning under 60 min promenad dokumenterad på iPhone och Android | fältprotokoll |
| All användartext finns på svenska och engelska | test som jämför nycklar |

## Risker och kvarvarande frågor

De fem största riskerna, i ordning, med åtgärd:

| Risk | Sannolikhet | Konsekvens | Åtgärd |
| --- | --- | --- | --- |
| Kamera och AR i iPhone-PWA (behörighet, ström som stoppas, realism) | hög | hög | spik 1 på riktig iPhone; kameran som överlägg; 2D som standard; filmisk look |
| Skärmen måste vara tänd; glapp i slingan och batteri | hög | medel–hög | överbrygga glapp, fånga mot reservatsgräns, ljudtips, pausläge, wake lock |
| Reservatsgeometri och uppblåsta arealer | medel | hög | buffra och fyll i metriska koordinater, filter, tak per promenad, fältfixturer |
| Dataförlust (Safari kontra installerad app, rensning) | medel | hög | installation före spel, `persist()`, exportpåminnelser |
| Balans och spelkänsla (tomt på djur, orättvis flykt) | hög | hög | balanssimulator, upptäckt via rörelsesensor, tidigt fälttest med barn |

### Öppna frågor (besvaras efter fas 1)

- 2D eller 3D i kameran, efter spik 1.
- Polygonbibliotek, efter spik 2.
- Exakta mötesfrekvenser, reservatsnivågränser och titeltrappor, efter fälttest.
- Leverantör av AI-genererade bilder och licensvillkor.
- Varumärkeskontroll av "Tiptoe" (EUIPO/TMview, PRV; klasserna 9, 28, 41) och domäner, före publik lansering.

## Utanför MVP

Multiplayer, delade reservat, familjeexpeditioner, serverdatabas, molnsynk, inloggning, offentliga topplistor, virtuell valuta, köp i appen, habitatpoäng, reservatsuppgraderingar, avancerad ekologisk simulering, WebXR och full spatial spårning, bakgrunds-GPS samt kampanjer och uppdrag.
