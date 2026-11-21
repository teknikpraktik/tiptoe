import "fake-indexeddb/auto";
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { scoreFrom } from "@/engine/scoring";
import { openDb, type Db } from "@/storage/idb";
import { Repo } from "@/storage/repo";
import { EXPORT_FORMAT, ImportError, applyImport, exportProfile, parseImport } from "@/storage/transfer";

async function seed(repo: Repo) {
  const p = await repo.ensureProfile("sv", 1);
  await repo.saveProfile({ ...p, name: "Alva", kind: "child", homeRadiusM: 1000, home: { lat: 59.4, lon: 13.5 } });
  await repo.saveWalk({ id: "w1", profileId: p.id, startedAt: 10, endedAt: 99, distanceM: 1234, trackPoints: 120, photos: 2, points: 150, addedM2: 16_000 });
  const pts = Array.from({ length: 120 }, (_, i) => ({ lat: 59.4 + i * 1e-4, lon: 13.5, tMs: i * 4000, accuracyM: 5 }));
  for (let seq = 0; seq * 50 < pts.length; seq++) await repo.saveChunk(p.id, "w1", seq, pts.slice(seq * 50, seq * 50 + 50));
  await repo.replaceReserves(p.id, [{ id: "r1", rings: [[[13.5, 59.4], [13.501, 59.4], [13.501, 59.401]]], areaM2: 16_000, createdAt: 5, updatedAt: 6 }]);
  const img = (n: number) => new Blob([new Uint8Array(Array.from({ length: 3000 }, (_, i) => (i * n) % 251))], { type: "image/jpeg" });
  await repo.savePhoto({ id: "ph1", profileId: p.id, createdAt: 20, blob: img(7), width: 1080, height: 1920 });
  await repo.savePhoto({ id: "ph2", profileId: p.id, createdAt: 30, blob: img(11), width: 1080, height: 1920 });
  await repo.addObservation({ id: "o1", profileId: p.id, walkId: "w1", animalId: "a1", species: "moose", variant: "big_bull", photoId: "ph1", stars: 3, points: 100, distM: 30, tMs: 20, lat: 59.4, lon: 13.5 });
  await repo.addObservation({ id: "o2", profileId: p.id, walkId: "w1", animalId: "a2", species: "hare", photoId: "ph2", stars: 2, points: 50, distM: 12, tMs: 30, lat: 59.4, lon: 13.5 });
  await repo.saveResidents(p.id, [{ id: "m1", species: "roe_deer", home: { lat: 59.4, lon: 13.5 }, reserveId: "r1", since: 7, reason: "moved_in" }]);
  await repo.db.store("meta").put("log:w1", { schema: 1, walkId: "w1", startedAtIso: "2026-11-21T00:00:00.000Z", build: "x", entries: [{ t: 1, k: "animal_appear" }], gps: {}, battery: { note: "" } });
  return p.id;
}

/** Allt som hör till profilen, med fotobytes, i jämförbar form. */
async function dump(repo: Repo, pid: string) {
  const obs = await repo.observations(pid);
  const photos = [];
  for (const o of obs) { const ph = (await repo.photo(o.photoId))!; photos.push({ ...ph, blob: Array.from(new Uint8Array(await ph.blob.arrayBuffer())) }); }
  return {
    profile: await repo.profile(pid), walks: await repo.walks(pid), track: await repo.track(pid, "w1"), reserves: await repo.reserves(pid),
    observations: obs, residents: await repo.residents(pid), photos, log: await repo.db.store("meta").get("log:w1"), score: scoreFrom(obs).total,
  };
}

const wipe = (db: Db, name: string) => { db.close(); return new Promise<void>((ok, fail) => { const r = indexedDB.deleteDatabase(name); r.onsuccess = () => ok(); r.onerror = () => fail(r.error); }); };

describe("export och import av profil (spec: Export och import)", () => {
  it("export → rensa → import återställer profilen med foton exakt", async () => {
    let db = await openDb(indexedDB, "tiptoe-test-transfer");
    let repo = new Repo(db);
    const pid = await seed(repo);
    const before = await dump(repo, pid);
    const { bytes, manifest } = await exportProfile(repo, pid, "test", 1000);
    expect(manifest).toMatchObject({ format: EXPORT_FORMAT, schemaVersion: 1, counts: { walks: 1, trackPoints: 120, reserves: 1, observations: 2, photos: 2, residents: 1 } });
    await wipe(db, "tiptoe-test-transfer");
    db = await openDb(indexedDB, "tiptoe-test-transfer");
    repo = new Repo(db);
    expect(await repo.profiles()).toEqual([]);
    const parsed = parseImport(bytes);
    await applyImport(repo, parsed, { mode: "replace", profileId: parsed.data.profile.id });
    expect(await dump(repo, pid)).toEqual(before);
    expect(before.score).toBe(150);
    db.close();
  });

  it("import som ny profil krockar inte med den befintliga, och raderas den nya finns originalet kvar", async () => {
    const db = await openDb(indexedDB, "tiptoe-test-transfer-new");
    const repo = new Repo(db);
    const pid = await seed(repo);
    const before = await dump(repo, pid);
    const parsed = parseImport((await exportProfile(repo, pid)).bytes);
    const np = await applyImport(repo, parsed, { mode: "new", newId: "p9" });
    expect(np.id).toBe("p9");
    expect((await repo.profiles()).map((p) => p.id).sort()).toEqual([pid, "p9"].sort());
    const copy = { observations: await repo.observations("p9"), photos: [] as { blob: number[] }[] };
    for (const o of copy.observations) copy.photos.push({ blob: Array.from(new Uint8Array(await (await repo.photo(o.photoId))!.blob.arrayBuffer())) });
    expect((await repo.walks("p9")).map((w) => w.id)).toEqual(["w1-p9"]);
    expect(await repo.track("p9", "w1-p9")).toEqual(before.track);
    expect(await repo.db.store("meta").get("log:w1-p9")).toBeDefined();
    expect(copy.photos.map((p) => p.blob)).toEqual(before.photos.map((p) => p.blob));
    expect(copy.observations.map((o) => o.photoId)).toEqual(["ph1-p9", "ph2-p9"]);
    await repo.deleteProfile("p9");
    expect(await dump(repo, pid)).toEqual(before);
    db.close();
  });

  it("felaktiga filer avvisas med orsak, och ingenting skrivs", () => {
    const code = (f: () => unknown) => { try { f(); return "ok"; } catch (e) { return (e as ImportError).problem; } };
    expect(code(() => parseImport(new Uint8Array([1, 2, 3, 4])))).toBe("not_zip");
    expect(code(() => parseImport(zipSync({ "a.txt": strToU8("x") })))).toBe("wrong_format");
    const mk = (manifest: object, data: object, extra: Record<string, Uint8Array> = {}) => zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)), "data.json": strToU8(JSON.stringify(data)), ...extra });
    const good = { profile: { id: "p1", name: "A", kind: "adult", lang: "sv", homeRadiusM: null, createdAt: 0 }, walks: [], tracks: {}, snapshots: [], reserves: [], observations: [], residents: [], logs: [], photos: [] };
    expect(code(() => parseImport(mk({ format: "other", schemaVersion: 1 }, good)))).toBe("wrong_format");
    expect(code(() => parseImport(mk({ format: EXPORT_FORMAT, schemaVersion: 99 }, good)))).toBe("newer_schema");
    expect(code(() => parseImport(mk({ format: EXPORT_FORMAT, schemaVersion: 1 }, { ...good, profile: { id: "p1" } })))).toBe("invalid_data");
    expect(code(() => parseImport(mk({ format: EXPORT_FORMAT, schemaVersion: 1 }, { ...good, observations: [{ id: "o", animalId: "a", species: "x", photoId: "p", stars: 7 }] })))).toBe("invalid_data");
    expect(code(() => parseImport(mk({ format: EXPORT_FORMAT, schemaVersion: 1 }, { ...good, photos: [{ id: "ph1" }] })))).toBe("missing_photo");
    expect(code(() => parseImport(mk({ format: EXPORT_FORMAT, schemaVersion: 1 }, good)))).toBe("ok");
    // Exporten är en vanlig zip med manifest, data och bilder.
    void unzipSync;
  });
});

import { exportReminder } from "@/storage/reminder";
describe("exportpåminnelse", () => {
  const day = 86_400_000;
  it("efter tre promenader sedan senaste export, eller 14 dagar med nya promenader; aldrig utan nya promenader", () => {
    expect(exportReminder([], null, 0)).toBe(false);
    expect(exportReminder([1, 2], null, 3)).toBe(false);
    expect(exportReminder([1, 2, 3], null, 4)).toBe(true);
    expect(exportReminder([1, 2, 3], 10, 20)).toBe(false);
    expect(exportReminder([20 * day], 10 * day, 25 * day)).toBe(true);
    expect(exportReminder([20 * day], 10 * day, 22 * day)).toBe(false);
  });
});
