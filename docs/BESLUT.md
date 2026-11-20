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
