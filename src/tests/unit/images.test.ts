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
      for (const v of ["side", "front", "back"]) for (const pose of ["calm", "alert"]) {
        const im = s.views[v][pose];
        expect(existsSync(path.join(root, im.src)), `${id} ${v} ${pose}`).toBe(true);
        expect(im.aspect).toBeGreaterThan(0.2);
        expect(im.aspect).toBeLessThan(8);
      }
    }
  });
});
