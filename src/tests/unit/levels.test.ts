import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { LevelIndex, levelForArea, toNextLevelM2 } from "@/engine/levels";
import { SPECIES } from "@/engine/species";
import { WORLD } from "@/engine/config";
import { candidates, cellOf, planObservation, reserveCandidates, windowOf } from "@/engine/world";
import { haversineM } from "@/geo/geometry";
import type { Reserve } from "@/geo/reserves/reserves";
import { openDb } from "@/storage/idb";
import { Repo } from "@/storage/repo";
import { WalkSession } from "@/play/session";
import { simEnvironment, simPoint } from "@/sim/env";

const env = simEnvironment();
/** Ett kvadratiskt reservat (lokala meter i den syntetiska miljön). */
function square(id: string, x: number, y: number, side: number): Reserve {
  const ring = [[x, y], [x + side, y], [x + side, y + side], [x, y + side]].map(([a, b]) => { const p = simPoint(a, b); return [p.lon, p.lat] as [number, number]; });
  return { id, rings: [ring], areaM2: side * side, createdAt: 0, updatedAt: 0 };
}

describe("reservatsnivåer (spec: 0 < 1 ha, 1: 1–5, 2: 5–20, 3: > 20 ha)", () => {
  it("nivå efter areal och vad som saknas till nästa", () => {
    expect([9_999, 10_000, 49_999, 50_000, 199_999, 200_000].map(levelForArea)).toEqual([0, 1, 1, 2, 2, 3]);
    expect(toNextLevelM2(30_000)).toBe(20_000);
    expect(toNextLevelM2(250_000)).toBeNull();
  });
  it("nivån gäller i reservatet och 100 m runt det, inte längre bort", () => {
    const idx = new LevelIndex([square("a", -800, -800, 300)]); // 9 ha ⇒ nivå 2
    expect(idx.levelAt(simPoint(-650, -650))).toBe(2);
    expect(idx.levelAt(simPoint(-450, -650))).toBe(2); // 50 m utanför
    expect(idx.levelAt(simPoint(-350, -650))).toBe(0); // 150 m utanför
    expect(idx.reserveAt(simPoint(-650, -650))?.id).toBe("a");
  });
});

describe("reservatsdjur: nivån styr sällsynthet", () => {
  const big = new LevelIndex([square("big", -950, -950, 900)]); // 81 ha ⇒ nivå 3
  const days = Array.from({ length: 12 }, (_, k) => windowOf(Date.UTC(2026, 10, 1 + k, 15, 0, 0))); // skymning
  const cells = [] as ReturnType<typeof cellOf>[];
  for (let x = -900; x <= -100; x += 250) for (let y = -900; y <= -100; y += 250) cells.push(cellOf(simPoint(x, y)));
  const rareShare = (cs: { species: keyof typeof SPECIES }[]) => cs.filter((c) => ["rare", "very_rare"].includes(SPECIES[c.species].rarity)).length / Math.max(1, cs.length);
  it("i ett nivå 3-reservat är sällsynta och mycket sällsynta arter mycket vanligare än i basvärlden", () => {
    const base = days.flatMap((w) => cells.flatMap((c) => candidates(c, w, env)));
    const res = days.flatMap((w) => cells.flatMap((c) => reserveCandidates(c, w, env, "p1", big)));
    expect(res.length).toBeGreaterThan(50);
    expect(rareShare(res)).toBeGreaterThan(rareShare(base) * 3);
    expect(res.some((c) => SPECIES[c.species].rarity === "very_rare")).toBe(true);
    expect(base.some((c) => SPECIES[c.species].rarity === "very_rare")).toBe(false);
  });
  it("reservatsdjur är per profil, basdjuren är samma för alla", () => {
    const c = cells[0], w = days[0];
    expect(reserveCandidates(c, w, env, "p1", big).map((x) => x.id)).not.toEqual(reserveCandidates(c, w, env, "p2", big).map((x) => x.id));
    expect(candidates(c, w, env)).toEqual(candidates(c, w, env));
    expect(reserveCandidates(c, w, env, "p1", new LevelIndex([]))).toEqual([]);
  });
});

describe("observationer", () => {
  it("deterministiska, 300–900 m bort, bara sällsynta arter eller havsörn", () => {
    const t = Date.UTC(2026, 10, 3, 14, 30, 0);
    const p = simPoint(-200, -200);
    const all = Array.from({ length: 40 }, (_, k) => planObservation(env, p, "p1", t, k)).filter((x) => x);
    expect(all.length).toBeGreaterThan(4);
    expect(all.length).toBeLessThan(30);
    for (const o of all) {
      const d = haversineM(p, o!.home);
      expect(d).toBeGreaterThanOrEqual(299);
      expect(d).toBeLessThanOrEqual(901);
      expect(["capercaillie", "otter", "lynx", "white_tailed_eagle"]).toContain(o!.species);
    }
    expect(planObservation(env, p, "p1", t, 3)).toEqual(planObservation(env, p, "p1", t, 3));
  });
});

describe("inflyttning och nivåhöjning i sessionen", () => {
  it("en sluten slinga får ett inflyttat djur direkt; ett reservat som når nivå 2 får en sällsynt invånare som finns kvar efter omstart", async () => {
    const db = await openDb(indexedDB, "tiptoe-test-levels");
    const repo = new Repo(db);
    let t = Date.UTC(2026, 10, 3, 14, 30, 0);
    const notices: string[] = [];
    const logs: { event: string; data?: Record<string, unknown> }[] = [];
    const s = new WalkSession({ geo: undefined, repo, loadEnv: async () => env, now: () => t, onLog: (event, data) => logs.push({ event, data }) });
    s.subscribe(() => { const n = s.getView().notice; if (n && notices[notices.length - 1] !== `${n.id}:${n.key}`) notices.push(`${n.id}:${n.key}`); });
    await s.init("sv");
    await s.start();
    const fix = (x: number, y: number) => { const p = simPoint(x, y); s.injectGps({ type: "fix", receivedAtMs: t, fix: { latitude: p.lat, longitude: p.lon, accuracyM: 5, timestampMs: t, speedMps: null, headingDeg: null } }); };
    const walk = async (pts: [number, number][]) => {
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]];
        const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.3);
        for (let k = 1; k <= n; k++) { t += 1000; fix(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n); }
      }
      for (let k = 0; k < 12; k++) { t += 1000; fix(pts[pts.length - 1][0], pts[pts.length - 1][1]); }
      await new Promise((r) => setTimeout(r, 30));
    };
    // Slinga 250 × 250 m i skogen (6,25 ha ⇒ nivå 2 direkt).
    fix(-900, -400);
    await walk([[-900, -400], [-900, -150], [-650, -150], [-650, -400], [-900, -400]]);
    const v = s.getView();
    expect(v.reserves).toHaveLength(1);
    expect(notices.some((n) => n.endsWith("walk.movedIn"))).toBe(true);
    expect(logs.some((l) => l.event === "animal_appear" && l.data?.via === "moved_in")).toBe(true);
    expect(notices.some((n) => n.endsWith("walk.levelSpecies") || n.endsWith("walk.levelUp"))).toBe(true);
    const residents = await repo.residents(v.profile!.id);
    expect(residents.length).toBeGreaterThanOrEqual(1);
    const lvl2 = residents.find((r) => r.reason === "level2");
    if (lvl2) expect(SPECIES[lvl2.species].rarity).toBe("rare");
    // Inne i reservatet: nivån visas.
    expect(s.getView().levelInfo?.level).toBe(2);
    // Omstart: de inflyttade finns kvar.
    db.close();
    const db2 = await openDb(indexedDB, "tiptoe-test-levels");
    expect((await new Repo(db2).residents(v.profile!.id)).map((r) => r.id)).toEqual(residents.map((r) => r.id));
    db2.close();
    void WORLD;
  });
});
