# SPÅR – Wildlife Adventure

GPS-baserat mobilspel (PWA) där spelaren utforskar verkliga omgivningar, upptäcker och fotograferar virtuella vilda djur i en AR-liknande kameravy och skapar egna naturreservat genom att gå slutna slingor.

*SPÅR was previously developed under the working name Tiptoe.* Repot, Vercel-projektet, paketnamnet och lagringens interna identifierare heter fortfarande `tiptoe` (se [Namn och identifierare](#namn-och-identifierare)).

- Produktspecifikation: [`docs/SPEC.md`](docs/SPEC.md)
- Arbetsinstruktion för fas 1: [`docs/PROMPT-FAS1.md`](docs/PROMPT-FAS1.md)
- Beslut efter fas 1: [`docs/BESLUT.md`](docs/BESLUT.md)
- Status: [`docs/STATUS-FAS1.md`](docs/STATUS-FAS1.md), [`docs/STATUS-FAS2.md`](docs/STATUS-FAS2.md)

Utvecklingen sker via PR mot `main`. Ingen kod ligger på `main` förrän första PR:en är granskad och mergad.

## Utveckling

Node 22.

```bash
npm ci
npm run dev            # utvecklingsserver
npm run typecheck      # tsc
npm run lint           # tsc --noUnusedLocals --noUnusedParameters
npm test               # Vitest
npm run build          # statisk export till out/
npm run e2e            # Playwright mot out/ med mockad GPS och fixtur-tiles (kräver build)
```

Felsökningsläge: `localStorage["tiptoe.debug"] = "on"`.

Kod som kopierats från Outbreak (`teknikpraktik/solosurvival@033a121`) har en rad `// Origin: …` överst. Outbreak ändras aldrig.

## Namn och identifierare

Produktens namn och texter finns i `src/config/brand.ts` (SPÅR i logotyp och på engelska, Spår i löpande svensk text). Följande interna namn heter fortfarande `tiptoe` och ska **inte** bytas utan en testad migrering, eftersom de bär spelarnas sparade data eller den delade världen:

| Identifierare | Var | Varför den behålls |
| --- | --- | --- |
| IndexedDB-databasen `tiptoe` | `src/storage/idb.ts` | Profiler, promenader, GPS-spår, reservat, observationer, foton |
| localStorage `tiptoe.lang`, `tiptoe.sound`, `tiptoe.debug`, `tiptoe.hint.*` | `src/app/_client/` | Inställningar och visade tips |
| Exportformatet `tiptoe-profile` | `src/storage/transfer.ts` | Gamla och nya exporter ska kunna importeras |
| Världsnyckeln `tiptoe-world-v1` | `src/engine/config.ts` | Ändras den byts alla djur i den delade världen ut |
| Cachenamn `tiptoe-static-*`, `tiptoe-pages-*` | `public/sw.js` | Bara filcacher; versionen höjs vid behov |
| `window.__tiptoe` | felsökning och e2e | Internt |
| Repo `teknikpraktik/tiptoe`, Vercel-projektet, paketnamnet `tiptoe`, CI-jobbet | GitHub, Vercel, `package.json` | Byte kräver separat beslut (länkar, deployment) |
