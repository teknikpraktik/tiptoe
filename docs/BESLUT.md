# Beslut

Fattade beslut efter fas 1. Specen (`docs/SPEC.md`) gäller där inget annat står här.

| Datum | Område | Beslut | Följd |
| --- | --- | --- | --- |
| 2026-11-20 | Kamera | 2D-utklipp med gyroförankring. 3D väljs inte. | `three`, 3D-vyn och glTF-platshållaren borttagna. |
| 2026-11-20 | Polygonbibliotek | Clipper2 via `clipper2-ts`. | `jsts`, `clipper2-js` (med Angular-beroenden och npm-sårbarheter) och geometrijämförelsen borttagna. |
| 2026-11-20 | Reservat | Slutningstoleransen 36 m (buffert 18 m) räcker. | Glapp 36–80 m sluts inte; oförändrat. |
| 2026-11-20 | Delad värld | Möten är per profil, individerna delade. | Oförändrat från fas 1. |
| 2026-11-20 | Fas 2 | Byggs innan fälttestet av fas 1. | Balansvärden (tempo, oro, mötesfrekvens) justeras när fältloggar finns. |
| 2026-11-20 | Djurbilder | Tydligt märkta platshållare per art tills AI-bilder med licens finns. | Bildmanifest per art, så att riktiga bilder byts in utan kodändring. |
| 2026-11-20 | Ljud | Syntetiskt med WebAudio. | Inga ljudfiler eller licenser; kan bytas mot inspelningar senare. |
| 2026-11-20 | Leverans | Staplade PR:er; Claude mergar när CI och Vercels förhandsdeploy är gröna. | Per granskar i efterhand. |
| 2026-11-21 | Djurbilder | Riktiga utklipp från Per (AI-genererade) ersätter platshållarna art för art (klart 2026-11-22: alla 16 arter). | Licensvillkoren för kommersiellt bruk ska dokumenteras i manifestet. |
| 2026-11-21 | Kamera | Telezoomen tar hänsyn till djurets storlek: djuret fyller ungefär 28 % av bildhöjden, 1–5×. Vertikalt siktstöd i tele. | Små djur syns bättre; vid 5× är synfältet 10°, så siktet är känsligare (fälttest). |
| 2026-11-21 | Livsmiljöer | Djur bara i sina hemmamiljöer, generöst tolkat. Bäver och utter vid åar, bäckar och sjöar; havsörn vid kusten eller sjöar ≥ 50 ha; varg, björn och lodjur i skog i hela landet. | Vattendrag (OpenMapTiles `waterway`) läses in. Varg och björn kräver fortfarande reservatsnivå 3. |
| 2026-11-21 | Säkerhet för barn | Inget djur står, vandrar eller flyr närmare än 12 m till vatten eller ett vattendrag (öppet vatten eller is). | Gäller alla arter, spår och flyktvägar. Diken och kulvertar räknas inte. |
| 2026-11-21 | Arter | Ren tillagd som 16:e art (utöver specen), bara i höglänt terräng: fjällen, Härjedalen, Jämtland, norra Dalarna och Värmland (Sälen, Idre, Branäs). | Ingen höjddata i tilesen: grov region (`src/geo/regions.ts`). Mästerranger kräver fortfarande specens 15 arter; renen är en bonusart. |
| 2026-11-22 | Karta | Ljus friluftsstil för dagsljus på OpenFreeMap (samma data som spelets miljö), med terrängskuggning ur Terrain Tiles på AWS (EU-DEM), etiketter (OpenFreeMaps typsnitt) och myrmönster ritat i koden. Lantmäteriets karta valdes bort: kräver konto och API-nyckel, och visar andra stigar än spelet använder. | Inga nycklar. Två nya värdar: typsnitt från `tiles.openfreemap.org`, höjddata från `s3.amazonaws.com`. Skärmbilder: `docs/karta-ljus.jpg`. |
| 2026-11-22 | Karta | Kompass upp är standard: kartan vrids efter telefonens kompass (överkantens riktning, plant eller upprätt), med GPS-färdriktningen som reserv utan kompass. Knappen växlar till norr upp. | iOS frågar om rörelse- och orienteringsbehörighet när promenaden startas. |
