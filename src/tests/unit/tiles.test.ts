// Origin: teknikpraktik/solosurvival@033a121 src/tests/unit/tiles.test.ts
// Tiptoe har inga egna stigtiles (Outbreaks Värmlandsdata kopieras inte). Kvar är testet av bakgrundskartans stil och tile-täckningen.
import { describe, expect, it } from "vitest";
import { MAP_STYLE, marshPattern } from "@/app/_client/mapStyle";
import { tileRange } from "@/geo/blockers";

describe("bakgrundskarta", () => {
  it("stilen hämtar bara från nyckelfria källor: OpenFreeMap (tiles och typsnitt) och Terrain Tiles på AWS; inga sprites", () => {
    expect(Object.keys(MAP_STYLE.sources).sort()).toEqual(["dem", "omt", "paper"]);
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

describe("målade texturer", () => {
  it("alla mönster i stilen finns (ritas i koden) och är sömlösa", async () => {
    const { MAP_TEXTURES } = await import("@/app/_client/mapTextures");
    const used = new Set(MAP_STYLE.layers.flatMap((l) => { const p = (l as { paint?: Record<string, unknown> }).paint ?? {}; return [p["fill-pattern"], p["background-pattern"]].filter((x): x is string => typeof x === "string"); }));
    for (const id of used) expect(id === "marsh" || id in MAP_TEXTURES, id).toBe(true);
    for (const [id, make] of Object.entries(MAP_TEXTURES)) {
      const t = make();
      expect(t.data.length, id).toBe(t.width * t.height * 4);
      // Sömlöst: första och sista kolumnen (och raden) skiljer sig lite, som två grannkolumner.
      let edge = 0, inner = 0;
      for (let y = 0; y < t.height; y++) for (let c = 0; c < 3; c++) {
        edge += Math.abs(t.data[(y * t.width) * 4 + c] - t.data[(y * t.width + t.width - 1) * 4 + c]);
        inner += Math.abs(t.data[(y * t.width + 10) * 4 + c] - t.data[(y * t.width + 11) * 4 + c]);
      }
      expect(edge, id).toBeLessThan(inner * 3 + t.height * 3);
    }
  });
});
