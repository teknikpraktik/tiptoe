# Tiptoe – Wild Encounters

GPS-baserad PWA där spelaren smyger sig nära virtuella vilda djur och fotograferar dem, och bygger reservat genom att gå slutna slingor.

- Produktspecifikation: [`docs/SPEC.md`](docs/SPEC.md)
- Arbetsinstruktion för fas 1: [`docs/PROMPT-FAS1.md`](docs/PROMPT-FAS1.md)

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
