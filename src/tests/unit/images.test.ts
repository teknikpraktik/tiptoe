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
  it("vildsvin, igelkott, hare, ekorre, grävling och räv har riktiga bilder med trekvart och liggande pose; resten är platshållare", () => {
    const real = ALL_SPECIES.filter((id) => manifest.species[id].placeholder === false);
    expect(real.sort()).toEqual(["badger", "hare", "hedgehog", "red_fox", "squirrel", "wild_boar"]);
    for (const id of real) {
      expect(manifest.species[id].views.quarter.calm.src).toMatch(/\.webp$/);
      expect(manifest.species[id].views.side.rest.src).toMatch(/side-lie\.webp$/);
    }
  });
});
