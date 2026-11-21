# Status fas 2

Datum: 2026-11-21. Fas 2 är byggd i åtta PR:er (#8–#15) och mergad till `main` (den sista efter CI och Vercels förhandsdeploy). Beslut: `docs/BESLUT.md`.

Som i fas 1: allt är verifierat i Node och i headless Chromium med mockad GPS, fejkad kamera och riktiga OpenStreetMap-tiles som fixturer. **Inget är provat på telefon eller utomhus, och fältloggar från fas 1 saknas.** Balansvärdena (tempo, oro, frys, mötesfrekvens) är startvärden.

## PR:er

| Del | PR | Innehåll |
| --- | --- | --- |
| 2.1 | teknikpraktik/tiptoe#8 | Städning efter spikarna (3D, JSTS, clipper2-js bort; `npm audit` 0), beslutslogg |
| 2.2 | teknikpraktik/tiptoe#9 | 15 arter, tid på dygnet (solens höjd), vattenzoner, varianter, platshållarbilder per art med manifest |
| 2.3 | teknikpraktik/tiptoe#10 | Reservatsnivåer, reservatsdjur per profil, inflyttning, sällsynta invånare, observationer |
| 2.4 | teknikpraktik/tiptoe#11 | Frys-moment, spår på kartan, titta upp |
| 2.5 | teknikpraktik/tiptoe#12 | Ljud: närhet med panorering, frys-varning, flykt, ambient (syntetiskt, WebAudio) |
| 2.6 | teknikpraktik/tiptoe#13 | Fältdagbok, titlar, varianter |
| 2.7 | teknikpraktik/tiptoe#14 | Flera profiler, språk per profil, hemområde, inställningar |
| 2.8 | teknikpraktik/tiptoe#15 | Export/import (zip), lagringsvarningar, exportpåminnelse, den här rapporten |

## Specens fas 2-lista

| Funktion | Status | Var |
| --- | --- | --- |
| Alla 15 arter | Klar | `src/engine/species.ts` |
| AI-genererade bilder | **Platshållare** (beslut). Bildformat och manifest är klara; riktiga bilder byts in utan kodändring | `public/animals/manifest.json`, `scripts/make-placeholders.mjs` |
| Reservatsnivåer och inflyttning | Klar | `src/engine/levels.ts`, `world.ts`, `play/session.ts` |
| Miljövikter och vattenzoner | Klar | `species.ts`, `geo/environment.ts` |
| Frys-moment | Klar | `engine.ts` (`freeze`) |
| Närhetsljud och ambient ljud | Klar (syntetiskt) | `src/audio/` |
| Spår på kartan | Klar | `engine.ts` (`makeTrail`), `GameMap.tsx` |
| Tid på dygnet | Klar | `src/engine/sun.ts` |
| Observationer | Klar | `world.ts` (`planObservation`) |
| Fältdagbok med titlar och varianter | Klar | `src/engine/progress.ts`, `/fieldbook` |
| Flera profiler | Klar | `storage/repo.ts`, `/settings` |
| Hemområde | Klar (begränsar observationer) | `session.ts` (`inHomeArea`) |
| Engelska | Klar | `src/i18n/en.ts` |
| Export och import | Klar | `src/storage/transfer.ts` |
| Installationsflöde och lagringsvarningar | Klar | startsidan, `/settings` (Säkerhetskopia) |

### Inte byggt (delar av specen utanför fas 2-listan, eller oklara)

- **Nudge:** "svag skuggning av levande miljöer på kartan" och "ljudtips mot närliggande natur". Kartans palett gör redan natur tydligare än bebyggelse, men det finns ingen särskild skuggning eller riktad ljudtips. Observationerna (som följer hemområdet) är den nudge som finns.
- **Bryggor och strandsten:** OpenMapTiles har inte bryggor som spärrade ytor. Vattenarter hålls 12 m från vattnet, men en brygga kan ligga närmare.
- **Batterimätning:** kräver fält (se nedan).

## Acceptanskriterier för fas 2

| Kriterium | Status | Belägg |
| --- | --- | --- |
| Alla funktioner i specen finns och är täckta av enhetstester där logiken är ren | **Delvis uppfyllt** | Allt i fas 2-listan finns. Ren logik har tester: 154 enhetstester i 27 filer, bland annat arter, sol, vattenzoner, nivåer, reservatsdjur, observationer, frys, spår, ljudregi, dagbok, profiler och export/import. Bilderna är platshållare, och nudge-skuggningen saknas (se ovan). |
| Export → rensa → import återställer en profil med foton exakt | **Uppfyllt** | `e2e/walk.e2e.mjs`: profilen exporteras som zip, hela databasen raderas och filen importeras. Fotonas SHA-256, observationer, reservat och promenader är identiska, och startsidan visar samma poäng, arter och areal. `transfer.test.ts` jämför dessutom all data byte för byte, även för import som ny profil. |
| Poäng räknas om identiskt från sparade observationer | **Uppfyllt** | `loop.test.ts`: samma total oavsett läsordning. `transfer.test.ts`: samma total efter export och import. |
| Batteriförbrukning under 60 min promenad dokumenterad på iPhone och Android | **Inte uppfyllt** | Kräver fältprotokoll. Fältloggen och `/field` har en anvisning för manuell mätning. |
| All användartext finns på svenska och engelska | **Uppfyllt** | `i18n.test.ts` jämför nycklar och platshållare; TypeScript kräver att varje svensk nyckel finns på engelska. |

## Avvikelser och tolkningar

| Avvikelse | Varför |
| --- | --- |
| Platshållarbilder | Beslut: ingen leverantör eller licens ännu; jag kan inte generera AI-bilder |
| Syntetiskt ljud | Beslut: inga ljudfiler eller licenser |
| Frys-förvarning 2 s | Stegräknaren behöver drygt 1 s utan steg för att säga "stilla" |
| Utan rörelsesensor tolereras smyg under blicken | GPS-farten jämnas ut över sekunder; annars går det inte att frysa i tid |
| Djur syns inom 130 m; mellan 130 och 260 m bara spår | Specen: höra och se spår före synen |
| Reservatsdjur som extra kandidater per profil | Den delade basvärlden ska vara lika för alla; nivån påverkar sällsynthet, inte antal möten |
| Titlarna Nykomling (0) och Överranger (12) tillagda | Ett steg mellan Ranger (8) och Mästerranger (15) |
| Tjäder i all skog | OpenMapTiles skiljer inte barrskog från lövskog |
| `fflate` 0.8.3 i stället för 0.8.2 | 0.8.2 har en känd sårbarhet i `unzipSync` (oändlig loop på felaktiga ZIP64), som importen använder |
| Appen laddar om när databasen raderas eller uppgraderas utifrån | Tidigare kastade appen fel i glappet; hittat i export-e2e-testet |

## Kända risker

1. **Inget är provat på telefon.** Kvar från fas 1: kamera och sensorer i installerad iOS-PWA och synfältet. Nytt: ljud på iPhone (upplåsning, tyst läge före iOS 17), frys-momentets känsla, och om spår och närhetsljud gör det lättare att hitta djur.
2. **Balansen.** Möten per minut är oförändrade (budgeten). Frys-intervallen (vanliga var 14–30 s), oron och inflyttningarna kan göra spelet för lätt eller för svårt.
3. **Bilderna** är tydligt platshållare. Spelkänslan i kameran avgörs av de riktiga bilderna.
4. **Prestanda** på en svag telefon med 15 arter, ljud och spår är inte mätt; enskilda delar mättes i fas 1.
5. **Determinism mellan Safari och Chrome** (flyttal) är fortfarande inte provad med två telefoner.

## Mätvärden

- Enhetstester: 154 i 27 filer. e2e: start 7/7, kamera 10/10, inställningar 8/8, promenad 27/27.
- Balanssimulatorn (8 × 60 min, 1,3 m/s): natur 5,5, blandad 6,0, bebyggelse 10,0 min/möte. I natur förekommer skogshare, igelkott, lodjur och vildsvin utöver fas 1-arterna.
- Bunt: `npm audit` 0 sårbarheter; inga dev-paket i appen. `three` är borta (−153 kB gzip som lazy-bunt).

## Fälttestlista (tillägg till fas 1-listan)

Utöver `docs/STATUS-FAS1.md`, med telefonen installerad och ljudet på:

1. **Inställningar:** skapa en **barnprofil**. Hemområdet ska vara 1 km. Byt språk till engelska och tillbaka. Exportera profilen; filen ska gå att spara eller dela.
2. **Promenad i skymning** (tid på dygnet): andra arter än mitt på dagen? Igelkott i park eller villaområde?
3. **Ljud:** hörs prassel och läten från rätt håll innan djuret syns? Hörs frys-varningen tydligt? Respekteras ringknappen (iOS 17+)?
4. **Spår:** leder prickarna till ett djur?
5. **Frys:** när ett djur förvarnar (puls, "Den lyfter huvudet …", tvåtonsljud), stanna. Står du still medan det tittar ("FRYS!") stannar djuret kvar; går du flyr det. Går det att hinna?
6. **Reservat:** gå en slinga på över 5 ha (t.ex. 250 × 250 m). Flyttar ett djur in direkt? Visar kartan nivå och vad som krävs för nästa? Kommer "Reservatet räcker nu för …"?
7. **Observation:** efter några km, kommer "… observerad åt …"? Ligger ringen inom hemområdet för barnprofilen?
8. **Fältdagbok:** arter, silhuetter, titel, foton i stort format och dela.
9. **Batteri:** notera procent före och efter 60 min promenad, med skärmens ljusstyrka, på iPhone och Android.
10. Exportera fältloggen från `/field` och skicka den.

## Förslag efter fälttestet

- Justera tempo, oro, frys och mötesfrekvens efter fältloggarna.
- Byt in riktiga bilder (manifestet) när leverantör och licens är valda.
- Bestäm om nudge-skuggningen behövs, eller om observationerna och ljuden räcker.
