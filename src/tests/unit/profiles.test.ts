import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { haversineM } from "@/geo/geometry";
import { planObservation } from "@/engine/world";
import { openDb } from "@/storage/idb";
import { Repo } from "@/storage/repo";
import { WalkSession } from "@/play/session";
import { simEnvironment, simPoint } from "@/sim/env";

describe("profiler", () => {
  it("skapa, byta och radera; raderingen tar bort profilens data men inte andras", async () => {
    const db = await openDb(indexedDB, "tiptoe-test-profiles");
    const repo = new Repo(db);
    const s = new WalkSession({ geo: undefined, repo, loadEnv: async () => simEnvironment(), now: () => 1000 });
    await s.init("sv");
    const first = s.getView().profile!;
    const kid = (await s.createProfile("Alva", "child", "sv"))!;
    expect(kid.homeRadiusM).toBeNull(); // hemområdet är borttaget
    expect(s.getView().profile?.id).toBe(kid.id);
    expect(s.getView().profiles.map((p) => p.name)).toEqual(["Ranger", "Alva"]);
    // Data för båda profilerna.
    for (const p of [first, kid]) {
      await repo.replaceReserves(p.id, [{ id: `r-${p.id}`, rings: [], areaM2: 1, createdAt: 0, updatedAt: 0 }]);
      await repo.savePhoto({ id: `ph-${p.id}`, profileId: p.id, createdAt: 0, blob: new Blob(["x"]), width: 1, height: 1 });
      await repo.addObservation({ id: `o-${p.id}`, profileId: p.id, walkId: "w", animalId: "a", species: "hare", photoId: `ph-${p.id}`, stars: 2, points: 50, distM: 10, tMs: 1, lat: 0, lon: 0 });
    }
    // Den aktiva profilen överlever en omstart.
    const s2 = new WalkSession({ geo: undefined, repo, loadEnv: async () => simEnvironment(), now: () => 2000 });
    await s2.init("sv");
    expect(s2.getView().profile?.id).toBe(kid.id);
    expect(s2.getView().score.total).toBe(50);
    expect(await s2.deleteProfile(kid.id)).toBe(true);
    expect(s2.getView().profile?.id).toBe(first.id);
    expect(await repo.reserves(kid.id)).toEqual([]);
    expect(await repo.observations(kid.id)).toEqual([]);
    expect(await repo.photo(`ph-${kid.id}`)).toBeUndefined();
    expect((await repo.reserves(first.id)).length).toBe(1);
    expect(await repo.photo(`ph-${first.id}`)).toBeDefined();
    // Den sista profilen kan inte raderas.
    expect(await s2.deleteProfile(first.id)).toBe(false);
    db.close();
  });
});

describe("observationer (motorn)", () => {
  it("kan begränsas till ett område", () => {
    const env = simEnvironment();
    const home = simPoint(-500, -500), me = simPoint(-500, -500);
    const allowed = (p: { lat: number; lon: number }) => haversineM(home, p) <= 600;
    const t = Date.UTC(2026, 10, 3, 14, 30, 0);
    const all = Array.from({ length: 60 }, (_, k) => planObservation(env, me, "p1", t, k, allowed)).filter((x) => x);
    expect(all.length).toBeGreaterThan(0);
    for (const o of all) expect(haversineM(home, o!.home)).toBeLessThanOrEqual(600);
  });
});
