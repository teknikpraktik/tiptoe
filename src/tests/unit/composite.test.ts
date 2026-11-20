import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { animalRect, lookFor, outputSize, visibleCrop } from "@/camera/composite";
import { openDb } from "@/storage/idb";
import { listPhotos, loadPhoto, savePhoto } from "@/storage/photos";

describe("sammanslagningens geometri", () => {
  it("beskärningen motsvarar object-fit: cover och zoom från mitten", () => {
    // 1920×1080-video (liggande sensor) i en porträttvy 390×844.
    const c = visibleCrop(1920, 1080, 390 / 844, 1);
    expect(c.h).toBe(1080);
    expect(c.w).toBeCloseTo(1080 * (390 / 844), 6);
    expect(c.x + c.w / 2).toBeCloseTo(960, 6);
    const z = visibleCrop(1920, 1080, 390 / 844, 2);
    expect(z.w).toBeCloseTo(c.w / 2, 6);
    expect(z.y + z.h / 2).toBeCloseTo(540, 6);
  });
  it("fotot får rimlig storlek även vid stark zoom", () => {
    const big = outputSize({ x: 0, y: 0, w: 2160, h: 3840 });
    expect(Math.max(big.w, big.h)).toBe(1600);
    const zoomed = outputSize({ x: 0, y: 0, w: 125, h: 270 });
    expect(Math.max(zoomed.w, zoomed.h)).toBe(1080);
  });
  it("djurets rektangel har fötterna i placeringspunkten", () => {
    const r = animalRect(1000, 2000, 0.5, 0.75, 0.1, 1.5);
    expect(r.y + r.h).toBeCloseTo(1500, 6);
    expect(r.x + r.w / 2).toBeCloseTo(500, 6);
    expect(r.h).toBeCloseTo(200, 6);
    expect(r.w).toBeCloseTo(300, 6);
  });
  it("längre bort: mjukare och kornigare", () => {
    expect(lookFor(1).blurPx).toBe(0);
    expect(lookFor(0).blurPx).toBeGreaterThan(lookFor(0.5).blurPx);
    expect(lookFor(0).grain).toBeGreaterThan(lookFor(1).grain);
  });
});

describe("foton i IndexedDB", () => {
  it("sparas som Blob och läses tillbaka, nyast först", async () => {
    const db = await openDb(indexedDB, "tiptoe-test-photos");
    await savePhoto(db, { id: "a", createdAt: 1, blob: new Blob(["x"], { type: "image/jpeg" }), width: 10, height: 20 });
    await savePhoto(db, { id: "b", createdAt: 2, blob: new Blob(["yy"], { type: "image/jpeg" }), width: 10, height: 20 });
    expect((await listPhotos(db)).map((p) => p.id)).toEqual(["b", "a"]);
    const a = await loadPhoto(db, "a");
    expect(a?.blob.size).toBe(1);
    db.close();
  });
});
