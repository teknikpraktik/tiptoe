// Origin: teknikpraktik/solosurvival@033a121 src/tests/unit/tiles.test.ts
// Tiptoe har inga egna stigtiles (Outbreaks Värmlandsdata kopieras inte). Kvar är testet av bakgrundskartans stil och tile-täckningen.
import { describe, expect, it } from "vitest";
import { MAP_STYLE, marshPattern } from "@/app/_client/mapStyle";
import { tileRange } from "@/geo/blockers";

describe("bakgrundskarta", () => {
  it("stilen hämtar bara från nyckelfria källor: OpenFreeMap (tiles och typsnitt) och Terrain Tiles på AWS; inga sprites", () => {
    expect(Object.keys(MAP_STYLE.sources).sort()).toEqual(["dem", "omt"]);
    const urls = [JSON.stringify(MAP_STYLE.sources), MAP_STYLE.glyphs ?? ""].join(" ").match(/https:\/\/[^/"]+/g) ?? [];
    expect(new Set(urls)).toEqual(new Set(["https://tiles.openfreemap.org", "https://s3.amazonaws.com"]));
    expect(MAP_STYLE.sprite).toBeUndefined();
    for (const l of MAP_STYLE.layers) {
      expect(["background", "fill", "line", "hillshade", "symbol"]).toContain(l.type);
      if (l.type === "symbol") for (const f of JSON.stringify(l.layout?.["text-font"]).match(/Noto Sans \w+/g) ?? []) expect(["Noto Sans Regular", "Noto Sans Italic", "Noto Sans Bold"]).toContain(f);
    }
    // Myrens mönster ritas i koden: 16 × 16 RGBA.
    expect(marshPattern().data.length).toBe(16 * 16 * 4);
  });
});

describe("tile-täckning runt spelaren", () => {
  it("en liten radie ger några få z14-rutor, aldrig en massnedladdning", () => {
    const r = tileRange({ lat: 59.38, lon: 13.5 }, 300, 14);
    const n = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(4);
  });
});

describe("spelets kartlager", () => {
  it("krockar inte med bakgrundsstilens lager-id (då läggs lagret aldrig till)", async () => {
    const { readFileSync } = await import("node:fs");
    const gm = readFileSync("src/app/_client/GameMap.tsx", "utf8");
    const own = [...gm.matchAll(/addLayer\(\{ id: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(own.length).toBeGreaterThan(5);
    const base = new Set(MAP_STYLE.layers.map((l) => l.id));
    expect(own.filter((id) => base.has(id))).toEqual([]);
  });
});
