import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { ratePhoto } from "@/camera/rating";
import { pointsForNew, scoreFrom } from "@/engine/scoring";
import { openDb } from "@/storage/idb";
import { Repo, type Observation } from "@/storage/repo";

const centered = { x: 0.5, y: 0.6, heightFrac: 0.2, offAxisDeg: 0, inFrame: true };

describe("fotobetyg", () => {
  it("nära, centrerat och lugnt ger 3 stjärnor; långt, i kanten och vaksamt ger 1", () => {
    expect(ratePhoto({ distM: 12, photoM: 35, placement: centered, state: "calm" }).stars).toBe(3);
    expect(ratePhoto({ distM: 34, photoM: 35, placement: { ...centered, x: 0.15 }, state: "alert" }).stars).toBe(1);
  });
  it("mellanläget ger 2 stjärnor", () => {
    expect(ratePhoto({ distM: 25, photoM: 35, placement: centered, state: "calm" }).stars).toBe(2);
  });
  it("djuret utanför bild ger inget betyg", () => {
    expect(ratePhoto({ distM: 10, photoM: 35, placement: { ...centered, inFrame: false }, state: "calm" }).stars).toBe(0);
  });
});

describe("poäng", () => {
  it("första fotot av en individ ger klasspoäng, fler foton av samma ger inget", () => {
    expect(pointsForNew("roe_deer", false)).toBe(50);
    expect(pointsForNew("moose", false)).toBe(100);
    expect(pointsForNew("moose", true)).toBe(0);
  });
  it("totalen räknas om identiskt från observationerna, i vilken ordning de än läses", () => {
    const obs = [
      { animalId: "a", species: "roe_deer" as const, stars: 2, tMs: 1 },
      { animalId: "a", species: "roe_deer" as const, stars: 3, tMs: 2 },
      { animalId: "b", species: "moose" as const, stars: 1, tMs: 3 },
      { animalId: "c", species: "badger" as const, stars: 0, tMs: 4 },
    ];
    const s = scoreFrom(obs);
    expect(s.total).toBe(150);
    expect(s.individuals).toBe(2);
    expect(s.bestStars).toEqual({ roe_deer: 3, moose: 1 });
    expect(scoreFrom([...obs].reverse())).toEqual(s);
  });
});

describe("lagringslagret", () => {
  it("profil, spår i bitar, reservat och observationer överlever att databasen stängs och öppnas igen", async () => {
    let db = await openDb(indexedDB, "tiptoe-test-repo");
    let repo = new Repo(db);
    const p = await repo.ensureProfile("sv", 1);
    expect((await repo.ensureProfile("en", 2)).id).toBe(p.id);
    await repo.saveWalk({ id: "w1", profileId: p.id, startedAt: 1, endedAt: null, distanceM: 0, trackPoints: 0, photos: 0, points: 0, addedM2: 0 });
    const pts = Array.from({ length: 120 }, (_, i) => ({ lat: 59 + i * 1e-4, lon: 13, tMs: i * 4000, accuracyM: 5 }));
    for (let seq = 0; seq * 50 < pts.length; seq++) await repo.saveChunk(p.id, "w1", seq, pts.slice(seq * 50, seq * 50 + 50));
    await repo.replaceReserves(p.id, [{ id: "r1", rings: [[[13, 59], [13.001, 59], [13.001, 59.001]]], areaM2: 5000, createdAt: 1, updatedAt: 1 }]);
    const o: Observation = { id: "o1", profileId: p.id, walkId: "w1", animalId: "a", species: "roe_deer", photoId: "ph", stars: 2, points: 50, distM: 20, tMs: 5, lat: 59, lon: 13 };
    await repo.addObservation(o);
    db.close();
    db = await openDb(indexedDB, "tiptoe-test-repo");
    repo = new Repo(db);
    expect((await repo.activeWalk(p.id))?.id).toBe("w1");
    expect(await repo.track(p.id, "w1")).toEqual(pts);
    expect((await repo.reserves(p.id)).map((r) => r.id)).toEqual(["r1"]);
    await repo.replaceReserves(p.id, [{ id: "r2", rings: [], areaM2: 1, createdAt: 1, updatedAt: 1 }]);
    expect((await repo.reserves(p.id)).map((r) => r.id)).toEqual(["r2"]);
    expect(await repo.observations(p.id)).toEqual([o]);
    db.close();
  });
});
