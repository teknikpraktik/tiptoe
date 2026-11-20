# Status fas 1

Datum: 2026-11-20. Fas 1 steg 1–6 är byggda och levererade som sex staplade PR:er. **Stopp: fas 2 påbörjas inte förrän Per har granskat och fälttestat.**

Det viktigaste att veta: allt är verifierat i Node och i headless Chromium med mockad GPS, fejkad kamera och riktiga OpenStreetMap-tiles som fixturer. **Ingenting är provat på en riktig telefon eller utomhus.** De acceptanskriterier som kräver fält eller manuellt test är därför markerade som delvis uppfyllda.

> **Efter fas 1 (se `docs/BESLUT.md`):** Kameratestet finns nu under **Test (fas 1) → Fälttest → Kameratest** (`/field/camera`, bara 2D). Geometritestet är borttaget eftersom biblioteket är valt; hoppa över det steget i listan nedan.

## PR:er (mergas i ordning)

| Steg | PR | Gren |
| --- | --- | --- |
| 1 Grund | teknikpraktik/tiptoe#1 | `claude/tiptoe-01-grund` → `main` |
| 2 Spik 1 kamera | teknikpraktik/tiptoe#2 | `claude/tiptoe-02-spik-kamera` → steg 1 |
| 3 Spik 2 reservatsgeometri | teknikpraktik/tiptoe#3 | `claude/tiptoe-03-spik-geometri` → steg 2 |
| 4 Deterministisk värld och djur | teknikpraktik/tiptoe#4 | `claude/tiptoe-04-varld` → steg 3 |
| 5 Spelloopen | teknikpraktik/tiptoe#5 | `claude/tiptoe-05-spelloop` → steg 4 |
| 6 Fälttestversion och den här rapporten | teknikpraktik/tiptoe#6 | `claude/tiptoe-06-falttest` → steg 5 |

Varje PR har gröna typecheck, lint, test och build. Mergas #1 först blir varje följande PR:s diff bara det egna steget. Förhandsdeploy från Vercel på PR-grenarna går att använda för telefontestet om Vercel-projektet är kopplat.

## Vad som är byggt

- **Grund:** Next.js 16 som statisk export, React 19, TypeScript 7, MapLibre 6.14, Vitest 5, `playwright-core`; CI med ett jobb (typecheck, lint, test, build); PWA-manifest och service worker; i18n med typade ordlistor (svenska standard, engelska komplett och kontrollerad i test); kopierade A-moduler från Outbreak `033a121` med ursprungsrad.
- **Spik 1 – kamera** (`docs/SPIKE-1-KAMERA.md`): överlägg på samma route, gyroförankrat 2D-utklipp, sammanslagning med filmisk look, lagring i IndexedDB, dela/spara till Bilder, 3D-jämförelse. Rekommendation: 2D.
- **Spik 2 – reservatsgeometri** (`docs/SPIKE-2-GEOMETRI.md`): buffra och fyll med glapp, hopp, självkorsning, återanslutning, sammanväxning och tak. Rekommendation: Clipper2 via `clipper2-ts`.
- **Värld och djur:** delad deterministisk värld (rutor 250 m, fönster 2 h), miljö ur vektortiles, fem arter, spawn per gången sträcka, oro → vaksam → flykt, tempo ur stegräkning, balanssimulator, världens fingeravtryck.
- **Spelloopen:** starta/avsluta promenad, karta med spår, reservat (med animation och hektartal) och djur, kamera inom fotoavstånd när spelaren står still, betyg 1–3 stjärnor, poäng för första fotot av en individ, en profil, lagring som överlever omstart (pausad promenad återställs).
- **Fälttestversion:** `/field` med GPS, lagring (`storage.estimate`), `persist()`-status och knapp, wake lock-stöd, test av stegräknare och kompass, fältlogg per promenad (möten, flykt, foton, reservat, kamerafel, GPS-räknare) som kan exporteras (med varning för att spåret följer med). Uppmaning att installera före första promenaden och varning i webbläsarläge. Felsökningsläge bakom `localStorage["tiptoe.debug"]="on"` (växlas på `/field`), som ger `window.__tiptoe`.

## Vad som inte är byggt (enligt plan, fas 2)

Arterna 6–15, riktiga bilder, reservatsnivåer och inflyttning, vattenzoner, frys-moment, ljud (närhet och ambient), spår på kartan, tid på dygnet, observationer av sällsynta arter, fältdagbok och titlar, varianter, flera profiler, hemområde, engelska som valbart språk i appen (ordlistan finns), export/import av profil, inställningssida.

## Avvikelser från specen och prompten

| Avvikelse | Varför | PR |
| --- | --- | --- |
| `main` skapades med bara `docs/` innan första PR | Repot var tomt; godkänt av Per i sessionen | – |
| GPS-kvalitetsnivåer ersatta (`ok/fair/weak/poor/unavailable`) | Outbreaks nivåer är infektionslogik; nya följer specens 25/30 m | #1 |
| `src/app/_client/build.ts` kopierad (står inte i listan) | `ServiceWorker.tsx` beror på den | #1 |
| Egen kartrotationsutjämning i stället för Outbreaks `bearing.ts` | `bearing.ts` står inte i kopieringslistan | #1 |
| Rättning i kopierad `ServiceWorker.tsx`: ingen omladdning vid första installationen | Omladdningen stängde kameran | #2 |
| `three` och `@types/three` som beroenden | Bara för 3D-jämförelsen; tas bort i fas 2 om 2D godkänns | #2 |
| **`clipper2-ts` i stället för `clipper2-js`** | `clipper2-js` 1.2.4 ger fel resultat (6 av 10 fixturer) och drar in Angular | #3 |
| `jsts`, `clipper2-js` som dev-beroenden | Bara för jämförelsesidan; tas bort i fas 2 | #3 |
| Möten är per profil, individerna delade | En individ som syns är identisk på alla telefoner, men vilka som "låses upp" beror på profilens gångna sträcka | #4 |
| Aktiv tid och frys-moment används inte | Specen lägger tid på dygnet och frys i fas 2 | #4 |
| Foto där djuret inte syns ger 0 stjärnor och ingen observation | Ett tomt foto ska inte ge poäng | #5 |
| Alla arter använder rådjursplatshållaren i kameran | Fas 1 har bara platshållare | #5 |
| Sidan dold ⇒ GPS, sensorer och timer stängs | Promptens batterikrav; spåret får ett glapp som reservatsreglerna hanterar | #5 |
| Fältloggen ligger i lagret `meta` | Specen har inget eget logglager; `meta` är "schemaversion, diagnostik" | #6 |

## Acceptanskriterier för fas 1

| Kriterium | Status | Belägg |
| --- | --- | --- |
| Kameravyn öppnas och fotograferar i installerad PWA på iPhone och Android | **Delvis uppfyllt** | Kedjan fungerar i headless Chromium med fejkad kamera (`e2e/camera.e2e.mjs` 12/12, `e2e/walk.e2e.mjs`). Inte provat i installerad PWA på telefon. Testlista i `docs/SPIKE-1-KAMERA.md`. |
| Djuret ligger kvar i bilden vid panorering ±45° | **Delvis uppfyllt** | e2e med syntetiska orienteringshändelser: djuret lämnar bilden vid ±45° åt rätt håll och kommer tillbaka till samma pixel (±10 px). Enhetstester för förankringen. Kräver manuellt test (verklig gyro/kompass, synfält). |
| En sluten slinga runt ett kvarter ger rätt areal inom ±10 % | **Delvis uppfyllt** (fixturer ja, fält nej) | Kvarter 100 × 120 m −5,1 %, 100 × 100 m −6,6 %, med brus ±10 m −6,5 … +3,1 % (`reserves.test.ts`, båda biblioteken). e2e i appen: 130 × 130 m → −0,7 %. Fält återstår. |
| Nästan sluten slinga (glapp ≤ 30 m) sluts; glapp ≥ 80 m sluts inte | **Uppfyllt** | `reserves.test.ts`: glapp 10, 20, 30 m sluts; 80, 100 m sluts inte. |
| GPS-hopp skapar ingen orimlig areal | **Uppfyllt** | `reserves.test.ts`: enstaka hopp 300 m tas bort (ytan −5,1 %); bestående hopp bryter spåret (< 0,1 ha); cykelfart ger ingen yta. |
| Samma plats och tid ger samma djur på två telefoner | **Delvis uppfyllt** (test ja, fält nej) | `world.test.ts`: två separat byggda miljöer ger identiska individer och tomgångspositioner; två motorer med samma promenad ger identiska möten; fingeravtryck på 190 individer i `world-fingerprint.txt`. Känd risk: `Math.sin/cos` kan skilja i sista biten mellan Safari och Chrome. Fält med två telefoner återstår. |
| Ett möte per 5–10 min i blandad miljö | **Delvis uppfyllt** (simulator ja, fält nej) | Balanssimulatorn: blandad 6,0 min/möte, natur 5,5, bebyggelse 10,0 (8 × 60 min). Frekvensen styrs av budgeten; fältvärdet beror på verklig gångfart och GPS. |
| Inga djur på vatten, byggnad, större väg eller järnväg | **Uppfyllt** | `world.test.ts` mot riktiga tile-fixturer (Karlstad): alla individer och tomgångspositioner över 2 h kontrollerade med `point-check`; flyende djur kontrollerade varje steg under en timmes simulerad löpning. Syntetisk miljö: även inom 60 m från gångbar linje. |
| Data finns kvar efter omstart av appen | **Uppfyllt** | `e2e/walk.e2e.mjs`: efter omladdning finns reservat, spår och poäng kvar och promenaden kan fortsätta; `session.test.ts` och `loop.test.ts` i Node. |

## Kända buggar och risker

1. **Inget är provat på telefon.** Störst risk: kamerabehörighet och svart ström i installerad iOS-PWA, gyro/kompass-kvalitet, synfältet (djuret kan "glida" mot bakgrunden).
2. **Stegräknaren** (tempo) är bara provad med syntetiska accelerometersignaler. Trösklarna (smyg < 1,45 steg/s, spring > 2,5) måste justeras i fält. Utan sensor används GPS-fart, som är brusig.
3. **Balansen** är bara simulerad. Oron (`alarmRate` 0,3) gör att det går att smyga fram till ett rådjur men inte att gå rakt fram; om det är roligt eller frustrerande avgörs i fält, gärna med barn.
4. **Reservatens slutningstolerans** är 36 m (glapp 36–80 m sluts inte). Ytan blir systematiskt 2–7 % för liten.
5. **Determinismen** mellan Safari och Chrome är inte provad (flyttal i `Math.sin/cos`).
6. **Alla arter ser ut som ett rådjur** i kameran, och kartmarkörerna skiljer bara på vanlig/ovanlig.
7. **Skärmen måste vara tänd.** När appen döljs stängs GPS:en; ett längre avbrott bryter spåret.
8. **Kartrutor offline:** saknas nät vid start läses miljön inte in och inga djur visas (meddelande på kartan). Redan hämtade rutor cachas i IndexedDB (högst 400).
9. **e2e körs inte i CI** (prompten begränsar CI till ett jobb med typecheck, lint, test, build). Kör `npm run build && npm run e2e` lokalt; kräver Chromium (`CHROMIUM_PATH`).
10. **Ett e2e-test var instabilt** en gång av flera körningar (kameraknappen ritades om medan testet klickade); testet är ändrat och har sedan gått grönt i alla körningar.

## Mätvärden

### Balanssimulatorn (`npx tsx scripts/balance.ts`, 8 × 60 min per miljö, 1,3 m/s)

| Miljö | min/möte | Mål | Arter (antal möten) |
| --- | --- | --- | --- |
| Natur (skog, park, åker) | 5,5 | 4–7 | rådjur 29, räv 28, ekorre 25, älg 3, grävling 3 |
| Blandad | 6,0 | 5–10 | ekorre 30, rådjur 23, räv 20, älg 4, grävling 3 |
| Bebyggelse | 10,0 | 8–12 | ekorre 22, räv 19, rådjur 7 |

### Reservatsgeometri (lång promenad, 641 punkter, mot 5 reservat)

| | Node | Chromium | Chromium CPU ×4 |
| --- | --- | --- | --- |
| `clipper2-ts` | 10,6 ms | 15–24 ms | 38–54 ms |

### Kamera (headless Chromium, fejkad kamera)

2D: första bildruta 94 ms, 60 fps, heap 6 MB. 3D: laddning 85 ms, 60 fps, heap 10 MB, +153 kB gzip.

### Tester

17 testfiler, 133 enhetstester. e2e: start 7/7, kamera 12/12, geometri 7/7, promenad 16/16.

## Fälttestlista för Per

Gör testet på **både iPhone och Android**, med appen **installerad** och startad från hemskärmen. Använd förhandsdeployen för PR #6 (eller `main` när allt är mergat).

### Förberedelse

1. Öppna adressen i Safari (iPhone) / Chrome (Android). Startsidan ska visa **Installera Tiptoe först**. Installera (iPhone: Dela → Lägg till på hemskärmen).
2. Starta från hemskärmen. Rutan om installation ska vara borta.
3. **Test (fas 1) → Fälttest:** kontrollera *Säker anslutning: ja*, *Installerad app: ja*, *Skärmlås: ja*. Tryck **Begär beständig lagring** och notera svaret. Tryck **Testa GPS**, **Testa stegräknaren** (gå några steg, stå still, smyg) och **Testa kompassen** (vrid dig). Notera vad som visas.
4. Gör **Kameratest (spik 1)** enligt listan i `docs/SPIKE-1-KAMERA.md` och **Geometritest (spik 2)** (tryck Kör jämförelsen, skicka siffrorna).
5. Notera batteriprocent och skärmens ljusstyrka.

### Promenaden (30–45 minuter, blandad miljö: bebyggelse, park och skog)

6. Tryck **Starta promenad**. Godkänn plats och rörelse.
   - [ ] Kartan visar dig, GPS-kvalitet och tempo (Stilla/Smyger/Går/Springer). Stämmer tempot när du står, smyger, går?
7. Gå runt ett **kvarter** (eller en annan sluten slinga på 1–3 ha) och tillbaka till startpunkten.
   - [ ] Ett gult fält tonar fram och "Nytt reservat: X ha" visas. Jämför X med kvarterets verkliga yta (t.ex. Eniro/Lantmäteriet).
8. Gå en slinga som slutar **20–30 m** från där den började, och en som slutar **80–100 m** därifrån.
   - [ ] Den första sluts, den andra inte.
9. Gå en slinga som börjar och slutar **mot kanten av ditt reservat**.
   - [ ] Reservatet växer ("+X ha – ditt reservat växer"), och det blir inte två reservat.
10. Gå vidare och notera tiden för **varje djur** som dyker upp (prick på kartan).
    - [ ] Ungefär ett möte per 5–10 minuter? Var var det (skog, park, stad)?
    - [ ] Inget djur står i vatten, i ett hus, på en större väg eller järnväg, eller långt från stigar.
11. **Smyg fram** till ett djur (långsamma, korta steg). När knappen **Kamera** blir aktiv: stå still, tryck, rikta mot djuret, fotografera.
    - [ ] Kameran öppnas utan att appen byter sida, djuret står på marken i rätt riktning.
    - [ ] Resultatet visar stjärnor och poäng ("Ny art!" första gången).
    - [ ] Gå rakt mot ett annat djur i vanlig takt: det ska bli vaksamt (gul puls) och fly.
    - [ ] Börja gå med kameran öppen: den ska stängas.
12. Lås skärmen 30 s och lås upp. Byt till en annan app i 1 minut och tillbaka.
    - [ ] Kartan och kameran fungerar igen; inga konstigheter med djur eller spår.
13. **Stäng appen helt** (svep bort) mitt i promenaden och starta den igen.
    - [ ] "Promenaden är pausad" visas; spår, reservat och poäng finns kvar. Fortsätt.
14. **Två telefoner:** gå en sträcka tillsammans med två telefoner (båda installerade).
    - [ ] Dyker samma djur upp på samma plats på båda?
15. Tryck **Avsluta**. Notera batteriprocent.
16. **Fälttest → Promenadloggar → Exportera** och skicka filen (den innehåller ditt GPS-spår).

Skicka med: telefonmodeller och OS-versioner, väder, terräng, batteri före/efter, ljusstyrka, och svaren ovan.

## Efter godkännande (förslag till början av fas 2)

1. Ta bort `three`, `jsts`, `clipper2-js` och spiksidorna om rekommendationerna godkänns.
2. Justera tempo, oro och mötesfrekvens efter fältloggarna; lägg till riktiga spår som fixturer.
3. Beslut som behövs från Per: slutningstoleransen (36 m eller större), om möten ska vara per profil (som nu) eller helt delade, och leverantör av AI-bilder.
