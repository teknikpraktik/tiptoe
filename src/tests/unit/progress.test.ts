import { describe, expect, it } from "vitest";
import { fieldBook, titleFor } from "@/engine/progress";

describe("fältdagbok och titlar", () => {
  it("titlar efter antal arter (Spårare 3, Ranger 8, Mästerranger alla 15)", () => {
    expect(titleFor(0)).toBe("newcomer");
    expect(titleFor(3)).toBe("tracker");
    expect(titleFor(8)).toBe("ranger");
    expect(titleFor(14)).toBe("senior_ranger");
    expect(titleFor(15)).toBe("master_ranger");
    expect(titleFor(16)).toBe("master_ranger");
  });
  it("räknar arter, individer, bästa betyg och varianter; foton utan betyg räknas inte", () => {
    const fb = fieldBook([
      { animalId: "a", species: "roe_deer", stars: 2, tMs: 1, photoId: "p1" },
      { animalId: "a", species: "roe_deer", stars: 3, tMs: 2, photoId: "p2" },
      { animalId: "b", species: "roe_deer", stars: 1, tMs: 3, photoId: "p3", variant: "big_buck" },
      { animalId: "c", species: "moose", stars: 0, tMs: 4, photoId: "p4" },
    ]);
    const roe = fb.entries.find((e) => e.species === "roe_deer")!;
    expect(roe).toMatchObject({ found: true, individuals: 2, photos: 3, bestStars: 3, variants: ["big_buck"], photoIds: ["p3", "p2", "p1"] });
    expect(fb.entries.find((e) => e.species === "moose")!.found).toBe(false);
    expect(fb.speciesFound).toBe(1);
    expect(fb.total).toBe(16);
    expect(fb.nextTitle).toEqual({ id: "tracker", species: 3 });
    // Vanliga först.
    expect(fb.entries[0].species).toBe("squirrel");
    expect(fb.entries[fb.entries.length - 1].species).toBe("white_tailed_eagle");
  });
});
