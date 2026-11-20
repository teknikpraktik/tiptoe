# Spik 2 – reservatsgeometri

Status: **klar i Node och headless Chromium. Ej mätt på riktig telefon och ej provad mot riktiga spår** (inga riktiga spår har lämnats ännu). Tidmätning på telefon: **Start → Test (fas 1) → Geometritest (spik 2)**.

## Valt bibliotek: Clipper2 via `clipper2-ts` 2.0.1

Inte `clipper2-js`, som prompten nämner som kandidat. Skälen står under Jämförelse; kort: `clipper2-js` 1.2.4 ger fel resultat på 6 av 10 fixturer och drar in Angular som peer-beroende. `clipper2-ts` är samma Clipper2-algoritm (Angus Johnson, Boost-licens), aktivt underhållen, utan beroenden, och klarar alla fixturer.

## Vad som är byggt

`src/geo/reserves/` – ren TypeScript, körs och testas i Node.

| Fil | Innehåll |
| --- | --- |
| `reserves.ts` | `computeReserves(ops, { track, existing, nowMs, newId, options })` → nya reservat, tillagd yta, skapade/växta/sammanslagna id, takade ytor, brott i spåret och nya ytor för animationen. |
| `ops.ts` | Biblioteksneutralt gränssnitt (`bufferLines`, `bufferPolys`, `union`, `intersect`) och areaberäkning. |
| `ops-clipper2-ts.ts` | Valt bibliotek. |
| `ops-jsts.ts`, `ops-clipper2-js.ts` | Bara för jämförelsen (dev-beroenden). |
| `bench.ts` | Fixturer med förväntningar + tidmätning; används av `scripts/spike2-bench.ts` och `/spike/geometry/`. |
| `src/sim/tracks.ts` | Syntetiska spår (rektanglar, glapp, brus, genom `GpsFilter`). |

### Algoritmen

1. **Spårets delar.** Fixar med noggrannhet ≥ 30 m bort. En enstaka punkt som ligger orimligt långt från båda grannarna (> 25 km/h) är ett GPS-hopp och tas bort. Glapp ≥ 50 m eller > 120 s bryter spåret; kortare glapp överbryggas. Över 12 km/h i mer än 20 s (cykel, bil) bryter spåret och den snabba delen kastas; kortare språngmarscher tolereras.
2. **Utjämning och förenkling.** Glidande medelvärde ±10 m längs spåret, sedan Douglas–Peucker 5 m. Ändpunkterna behålls (de avgör om slingan sluts).
3. **Buffra** varje del med 18 m (halva slutningstoleransen; glipor upp till 36 m sluts), runda ändar och hörn, i lokala meter (`toLocal`).
4. **Union** med spelarens befintliga reservat. Inre hål som den **nya** korridoren gränsar till är innesluten yta (gamla hål i orörda reservat räknas inte – annars kunde en kort promenad var som helst "fylla" ett gammalt hål).
5. **Ny yta** = hålet buffrat tillbaka 18 m med spetsiga hörn (≈ ytan innanför den gångna linjen), begränsat till hål + korridor + reservat. Under 0,1 ha räknas inte.
6. **Tak** per promenad (50 ha): ytorna läggs till minsta först; det som inte ryms rapporteras som takat.
7. **Sammanslagning** med befintliga reservat; ett sammanväxt reservat behåller id:t från det största, de andra rapporteras som sammanslagna. Arealen räknas på den sammanslagna ytan.

Utdata är GeoJSON-ringar `[lon, lat]`, redo för kartan.

## Jämförelse

Samma algoritm och fixturer för alla tre. Tider är median för en hel omräkning av en lång promenad (641 spårpunkter, ~45 min, fyra slingor, brus) mot fem befintliga reservat.

| | `clipper2-ts` 2.0.1 | `jsts` 2.12.1 | `clipper2-js` 1.2.4 |
| --- | --- | --- | --- |
| Fixturer rätt | **10/10** | 10/10 | 4/10 |
| Node (container) | **10,6 ms** | 31 ms | 38 ms (fel resultat) |
| Headless Chromium | **23,5 ms** | 36 ms | 39 ms |
| Chromium, CPU ×4 (≈ medelstark telefon) | **54 ms** | 115 ms | 172 ms |
| Bunt, minifierad / gzip | 104 kB / **29 kB** | 274 kB / 61 kB | 68 kB / 19 kB |
| Beroenden | inga | inga | Angular 15 som peer (installeras av npm, säkerhetsvarningar) |
| Senast publicerad | 2025-12 | 2024-11 | 2024-01 |
| Licens | Boost | EPL/EDL | Boost |

Algoritmens egen kod: 4,4 kB minifierad (2 kB gzip).

### Varför inte `clipper2-js`

- `ClipperOffset` ger fel bredd för öppna linjer (korridoren runt en 590 m lång slinga blev 6 960 m² i stället för ~21 300 m²). Därför sluts små slingor inte och glapp på 30 m sluts inte.
- `Clipper64.executePolyTree` returnerar `false` och ett tomt träd. Adaptern har en egen hålnästning för att alls kunna jämföra.
- `package.json` kräver `@angular/core` och `@angular/common` som peer-beroenden; npm 7+ installerar dem, med kända sårbarheter enligt `npm audit` (koden använder dem inte).

### Varför inte JSTS/Turf

Klarar alla fixturer (Turfs `buffer` bygger på samma JTS-motor) men är 2–3 gånger långsammare på strypt CPU och dubbelt så stor. Saknar typdefinitioner för 2.x. Ingen fördel för det här användningsfallet.

### Detaljer per fixtur (`clipper2-ts`)

Avvikelse från förväntad yta (positiv = för stor):

| Fixtur | Krav | Resultat |
| --- | --- | --- |
| Kvarter 100 × 120 m | ±10 % | −5,1 % |
| Kvarter 100 × 100 m | ±10 % | −6,6 % |
| Brus σ 5 m (≈ ±10 m), genom `GpsFilter`, 5 seeds | ±10 % | +2,3, −2,3, +3,1, +0,2, −6,5 % |
| Glapp 10, 20, 30 m | sluts | sluts |
| Glapp 80, 100 m | sluts inte | sluts inte |
| Glapp i spåret 40 m / 70 m | överbryggas / bryts | överbryggas / bryts |
| GPS-hopp, en punkt 550 m bort | ingen orimlig yta | −5,1 % (hoppet borttaget) |
| Bestående hopp (flera punkter 600 m bort) | ingen yta | < 0,1 ha, spåret bryts |
| Noggrannhet 35 m | ingen yta | ingen |
| Cykelfart hela slingan | ingen yta | ingen, spåret bryts |
| Kort språngmarsch (< 20 s) | sluts | sluts |
| Åtta 200 × 200 m | ±15 % | −11,1 % (JSTS −6,2 %) |
| Utstickare | bara slingan | −1,5 % |
| Liten slinga 25 × 25 m | ingen yta | ingen |
| Återanslutning mot befintlig gräns | ±15 % | −1,0 %, ett reservat |
| Två reservat växer ihop | ett reservat, ingen dubbelräkning | ett, −4,5 % |
| Samma slinga igen | ingen ny yta | < 8 % (bruskanter) |
| Tak 50 ha | stor yta avvisas | avvisas och rapporteras |

Enhetstester: `src/tests/unit/reserves.test.ts` (18 fall × 2 bibliotek). e2e: `npm run e2e -- geometry`.

## Kända begränsningar

1. **Systematiskt något för liten yta** (−2 till −7 %): hörn kapas lite av utjämningen och förenklingen. Ryms inom ±10 %. Kan justeras med `smoothM` (10 m) efter fälttest.
2. **Slutningstoleransen är 36 m** (2 × 18 m). Kravet "glapp ≤ 30 m sluts, ≥ 80 m sluts inte" är uppfyllt, men glapp mellan 36 och 80 m sluts heller inte. Specens "Glapp under cirka 50 m överbryggas" gäller glapp *i spåret* (saknade punkter), vilket hanteras separat i steg 1. Vill Per att en slinga som slutar 45 m från start ska slutas behöver bufferten upp till 23–25 m, vilket gör korridoren bredare och små slingor (< ~50 m tvärs) omöjliga.
3. **Åttor** blir ett reservat (korsningspunkten binder ihop dem) och tappar lite yta vid korsningen.
4. **Hela promenaden räknas om** vid varje anrop. 54 ms vid 4× strypning är acceptabelt om det görs högst var 10:e sekund eller vid ny spårpunkt nära startpunkten/en reservatsgräns. Spelloopen (steg 5) räknar om i bakgrunden med strypning.
5. **Inga riktiga spår** har prövats. Fältfixturer läggs till när Per har gått några slingor (exporterbar logg i steg 6).
6. **Projektion**: lokal plan runt promenadens första punkt. Fel < 0,1 % inom några km; reservat långt från varandra (andra städer) projiceras ändå korrekt eftersom varje reservat bara jämförs med promenaden det rör.

## Efter spiken

- `clipper2-ts` är körtidsberoende.
- `jsts` och `clipper2-js` (med Angular) är dev-beroenden bara för jämförelsesidan; de tas bort i början av fas 2 tillsammans med `ops-jsts.ts`, `ops-clipper2-js.ts` och sidan, om Per godkänner valet.
