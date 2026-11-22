import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_SPECIES } from "@/engine/species";

const root = path.join(import.meta.dirname, "..", "..", "..", "public");
const manifest = JSON.parse(readFileSync(path.join(root, "animals", "manifest.json"), "utf8"));

describe("djurbilder (manifestet)", () => {
  it("varje art har tre vinklar och två poser med fil, bildförhållande och licens (spec: Bilder av djuren)", () => {
    for (const id of ALL_SPECIES) {
      const s = manifest.species[id];
      expect(s, id).toBeDefined();
      expect(s.license, id).toBeTruthy();
      const views = ["side", "front", "back", ...(s.views.quarter ? ["quarter"] : [])];
      for (const v of views) for (const pose of ["calm", "alert", ...(s.views[v].rest ? ["rest"] : [])]) {
        const im = s.views[v][pose];
        expect(existsSync(path.join(root, im.src)), `${id} ${v} ${pose}`).toBe(true);
        expect(im.aspect).toBeGreaterThan(0.2);
        expect(im.aspect).toBeLessThan(8);
      }
    }
  });
});

describe("riktiga bilder", () => {
  it("alla arter har riktiga bilder med alla vyer och poser; inga platshållare kvar", () => {
    const real = ALL_SPECIES.filter((id) => manifest.species[id].placeholder === false);
    expect(ALL_SPECIES.filter((id) => !real.includes(id))).toEqual([]);
    for (const id of real) {
      const v = manifest.species[id].views;
      for (const view of ["side", "quarter", "front", "back"] as const) for (const pose of ["calm", "alert", "rest"] as const) {
        expect(v[view][pose].src, `${id} ${view} ${pose}`).toMatch(/^\/animals\/[a-z_]+\/[a-z-]+\.webp$/);
        expect(existsSync(`public${v[view][pose].src}`), v[view][pose].src).toBe(true);
      }
    }
  });
});
