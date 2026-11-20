// Origin: teknikpraktik/solosurvival@033a121 src/tests/unit/tiles.test.ts
// Tiptoe har inga egna stigtiles (Outbreaks Värmlandsdata kopieras inte). Kvar är testet av bakgrundskartans stil och tile-täckningen.
import { describe, expect, it } from "vitest";
import { MAP_STYLE } from "@/app/_client/mapStyle";
import { tileRange } from "@/geo/blockers";

describe("bakgrundskarta", () => {
  it("stilen är lätt: bara fyllnads-/linjelager mot en källa, inga etiketter eller sprites", () => {
    const srcs = Object.keys(MAP_STYLE.sources);
    expect(srcs).toEqual(["omt"]);
    for (const l of MAP_STYLE.layers) {
      expect(["background", "fill", "line"]).toContain(l.type);
      if ("source" in l) expect(srcs).toContain(l.source);
    }
    expect(MAP_STYLE.sprite).toBeUndefined();
    expect(MAP_STYLE.glyphs).toBeUndefined();
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
