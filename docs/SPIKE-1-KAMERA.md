# Spik 1 – kamera på iPhone

Status: **byggd och verifierad i headless Chromium. Inte verifierad på riktig iPhone eller Android** – det kräver Pers telefontest (testlista nedan). Rekommendationen är därför preliminär tills testlistan är genomgången.

## Vad som är byggt

Testsida: **Start → Test (fas 1) → Kameratest (spik 1)** (`/spike/camera/`), nåbar inifrån den installerade appen.

| Del | Fil | Kommentar |
| --- | --- | --- |
| Kameravy som överlägg på samma route | `src/app/_client/CameraView.tsx` | Ingen navigering. Monteras ovanpå sidan och avmonteras vid stängning. |
| Bakre kameran | `src/app/_client/camera.ts` | `getUserMedia({ facingMode: "environment", 1920×1080 ideal })`, inget ljud. Spåren stoppas när vyn stängs och när sidan döljs. |
| Svart ström efter bakgrund | `CameraView.tsx` | Strömmen begärs om vid `visibilitychange` (synlig) och av en vakthund var 3:e s om spåret är avslutat, tystat eller videon saknar storlek. |
| Orientering | `src/sensors/orientation.ts`, `src/app/_client/orientationSource.ts` | Kamerans kurs och höjdvinkel ur alpha/beta/gamma (samma formel som Outbreaks `compass.ts`, testad mot den). iOS-behörigheten begärs i klickhanteraren som i `compass.ts`. |
| Gyroförankring | `AnchoredYaw` i `src/sensors/orientation.ts` | Gyrots jämna relativa kurs + en förskjutning som långsamt (τ = 2,5 s) dras mot kompassen. Kompassdarr syns inte; gyrodrift rättas inom några sekunder. Utan kompass förankras djuret rakt fram där kameran pekar. |
| Placering i bilden | `src/camera/projection.ts` | Tan-projektion med synfält 50° × 66° (porträtt), teleobjektivzoom 1–4× ur avståndet, fötterna under horisonten efter ögonhöjd 1,4 m, spelarens höjdjustering (reglage till höger). Vinkel (fram/sida/bak) väljs ur djurets kurs relativt spelaren. |
| Sammanslagning | `src/camera/composite.ts` | Videon beskärs exakt som förhandsvisningen (`object-fit: cover` + zoom), sedan kontaktskugga, djuret (avståndsoskärpa via ned-/uppskalning, inte `ctx.filter` som saknas i äldre Safari), gemensam varm ton (`soft-light`), kornighet och vinjett. `toBlob` JPEG 0,82. |
| Lagring | `src/storage/photos.ts` | Bild-Blob i IndexedDB-lagret `photos`. Canvas tar bort EXIF, så ingen position följer med. |
| Dela / spara till Bilder | `src/app/_client/share.ts` | `navigator.share({ files })` när `canShare` säger ja (iOS visar "Spara bild"), annars nedladdning. |
| 3D-jämförelse | `src/camera/three-view.ts`, `public/animals/placeholder/roe.glb` | Three.js 0.186 laddas med `import()` bara i 3D-läget. Statisk lågpolygonmodell (9 kB, byggd av `scripts/make-placeholder-glb.mjs`). Samma kurs, höjdvinkel, synfält och avstånd som 2D. |
| Platshållare | `public/animals/placeholder/roe-*.png` | Rådjur, tre vinklar × två poser (lugn/vaksam), transparent PNG, märkta "PLATSHÅLLARE". |

Mätvärden visas och kan kopieras från testsidan (**Mätvärden → Kopiera mätvärden**): tid till första bildruta, bildfrekvens, 3D-laddtid, JS-heap (bara Chromium), antal omstarter av strömmen, sensorstatus, videoupplösning och en händelselogg.

## Mätvärden

### Headless Chromium (container, mjukvaru-GPU, fejkad kamera)

| | 2D | 3D |
| --- | --- | --- |
| Tid till första bildruta | 94 ms | 74 ms (kameran var redan "varm") |
| Bildfrekvens i vyn | 60 fps | 60 fps |
| Laddtid (bunt + modell) | – | 85 ms (lokalt, utan nät) |
| JS-heap | 6 MB | 10 MB |
| Extra JS | 0 | Three.js-bunt 617 kB (153 kB gzip), laddas bara i 3D |
| Fotostorlek | 499 × 1080, 35 kB* | samma format |

\* Den fejkade kameran är nästan enfärgad; ett riktigt foto blir större. Målet 300–600 kB kontrolleras på telefon.

### iPhone och Android

**Ej mätt.** Fylls i från Pers test (kopiera mätvärdena från testsidan och klistra in här).

| Enhet | iOS/Android | Installerad PWA | Kamera öppnas | Djuret följer vid ±45° | Foto sparas | Spara till Bilder | fps 2D | fps 3D | 3D-laddtid |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | | |

## Verifierat automatiskt

`npm run e2e -- camera` (headless Chromium, 12 kontroller):

- kameravyn öppnas utan navigering (URL oförändrad),
- djuret syns rakt fram, flyttar sig åt rätt håll vid vridning, är utanför bild vid ±45° och ligger kvar på samma pixel (±10 px) när telefonen vrids tillbaka,
- foto sammanslås, visas och sparas i IndexedDB, i både 2D och 3D,
- 3D laddas lazy och ritar,
- inga JS-fel.

Enhetstester: `camera.test.ts` (orientering, förankring, projektion, zoom, vinkelval) och `composite.test.ts` (beskärning, storlek, djurets rektangel, IndexedDB-Blob).

## Kända risker och buggar

1. **Kamerabehörighet i installerad iOS-PWA.** iOS frågar ofta om kameran igen vid varje kallstart av en fristående PWA. Det går inte att undvika i webben; vyn visar ett tydligt fel om den nekas. Bekräftas i fälttestet.
2. **Rörelsesensorer på iOS.** `DeviceOrientationEvent.requestPermission` måste anropas i en användargest och gäller per session. Nekas den står djuret still rakt fram (vyn säger det). Att Chromium också har `requestPermission` upptäcktes i e2e; behörigheten måste därför alltid begäras, inte bara på iOS.
3. **Synfältet är en uppskattning.** 50° × 66° är rimligt för en huvudkamera i porträtt men varierar mellan telefoner och med `object-fit: cover`. Fel synfält ger att djuret "glider" lite relativt bakgrunden vid panorering. Kan kalibreras per enhet senare (vrid 30° och se hur långt bakgrunden flyttar sig).
4. **Kompassens kvalitet.** iOS `webkitCompassHeading` med noggrannhet sämre än 35° räknas som saknad. Android ger absolut kurs via `deviceorientationabsolute`; vissa telefoner saknar magnetometer – då förankras djuret där kameran pekar.
5. **Skala per bild.** Djurets höjd i bilden räknas från bildens höjd. Slutbilderna (fas 2) måste beskäras tätt runt djuret och ha en angiven verklig höjd; platshållarna har luft runt sig och ser därför mindre ut än 3D-modellen.
6. **Service workern laddade om sidan vid första installationen** (ärvt från Outbreak: `controllerchange` efter `clients.claim()`). Det stängde den öppna kameran i e2e. Rättat: omladdning bara vid byte från en tidigare version.
7. **WebGL-kontext** kan tappas på iPhone under minnesbrist (3D). Hanteras inte i spiken; skäl till att inte välja 3D.

## Rekommendation: 2D som standard, 3D väljs inte

Motivering:

- **Robusthet på iPhone.** 2D-vägen använder bara `<video>`, `<img>`, CSS-transformer och Canvas 2D – samma tekniker i alla iOS-versioner sedan 14. 3D lägger till WebGL (kontextförlust, minne, värme) utan att göra kedjan enklare.
- **Storlek.** 3D kräver Three.js: 617 kB (153 kB gzip) extra. 2D kostar ingenting extra.
- **Bilder.** Specen har redan låst AI-genererade fotorealistiska utklipp. Fotorealistisk 3D skulle kräva riggade, texturerade modeller per art och pose – ett helt annat produktionsarbete. Lågpolygonmodellen i spiken visar att även en enkel 3D-modell ser mer "spel" än "foto" ut ovanpå en riktig kamerabild.
- **Vinklar.** 3D:s fördel (godtycklig vinkel) täcks tillräckligt av tre vinklar × två poser plus spegling.
- **Realism.** Den filmiska looken (ton, korn, vinjett, kontaktskugga, avståndsoskärpa) gör mer för att dölja sammanfogningen än vad 3D gör.

Om Pers test visar att 2D-djuret "glider" störande vid panorering är åtgärden att kalibrera synfältet, inte att byta till 3D. Väljs 2D tas `three`, `@types/three`, `three-view.ts` och `roe.glb` bort i början av fas 2.

## Testlista för Per (telefon)

Gör på **iPhone** och **Android**, med appen **installerad** (Dela → Lägg till på hemskärmen på iPhone; Installera app i Chrome på Android) och öppnad från hemskärmen. Utomhus i dagsljus.

1. Starta appen från hemskärmen. Tryck **Kameratest (spik 1)**.
2. Tryck **Öppna kameran**. Godkänn rörelsesensorer och kamera.
   - [ ] Kamerabilden syns inom några sekunder och är inte svart.
   - [ ] Ett platshållarrådjur står på marken framför dig.
3. Vrid dig långsamt 45° åt höger och sedan 45° åt vänster om djuret, och tillbaka.
   - [ ] Djuret ligger kvar på samma plats i världen (följer marken, inte skärmen).
   - [ ] Det darrar inte och hoppar inte märkbart.
   - Notera om det glider (hur mycket, åt vilket håll).
4. Luta telefonen upp och ner.
   - [ ] Djuret flyttar sig upp/ner i bilden som om det stod på marken.
   - [ ] Reglaget till höger flyttar djuret upp och ner.
5. Tryck avtryckaren.
   - [ ] Fotot visas med djuret där du såg det, med varm ton, vinjett och lätt korn.
   - [ ] Storleken (kB) som visas ligger mellan cirka 300 och 600 kB.
6. Tryck **Spara till Bilder / dela** → **Spara bild** (iPhone) / spara (Android).
   - [ ] Fotot finns i telefonens Bilder.
   - [ ] Fotot saknar plats (Bilder → info: ingen karta).
7. Öppna kameran igen, tryck hemknappen/byt app i 10 s, gå tillbaka.
   - [ ] Kamerabilden kommer tillbaka (inte svart). Om den är svart: hur länge?
8. Byt till **3D-modell** och upprepa steg 2–5.
   - [ ] Modellen laddas, följer marken, kan fotograferas.
   - Jämför: hur ser 2D och 3D ut ovanpå kamerabilden? Vilken känns mest som ett foto?
9. Ändra **Avstånd** (5, 20, 50 m) och **Djurets kurs**, öppna kameran igen.
   - [ ] Längre avstånd ger mer zoom och mjukare djur. Fram/sida/bak byts med kursen.
10. Stäng appen helt och starta igen. **Sparade foton** ska visa samma antal.
11. Öppna **Mätvärden → Kopiera mätvärden** och klistra in texten i ett meddelande (iPhone-modell och iOS-version, Android-modell och version).
