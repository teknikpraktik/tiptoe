import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BACKGROUND, BACKGROUND_SAMPLES, sampleUrl } from "@/audio/samples";
import { ALL_SPECIES } from "@/engine/species";
import { AUDIO, SoundDirector, ambienceFor, panFor, type HeardAnimal } from "@/audio/director";
import { simPoint } from "@/sim/env";

const me = simPoint(0, 0);
const at = (x: number, y: number, id: string, species: HeardAnimal["species"] = "badger"): HeardAnimal => ({ id, species, pos: simPoint(x, y) });

describe("ljudregi", () => {
  it("panorering: djur till höger hörs till höger, rakt fram i mitten, okänd riktning i mitten", () => {
    expect(panFor(me, simPoint(100, 0), 0)).toBeCloseTo(1, 3);
    expect(panFor(me, simPoint(-100, 0), 0)).toBeCloseTo(-1, 3);
    expect(panFor(me, simPoint(0, 100), 0)).toBeCloseTo(0, 3);
    expect(panFor(me, simPoint(100, 0), 90)).toBeCloseTo(0, 3); // man tittar österut
    expect(panFor(me, simPoint(100, 0), null)).toBe(0);
  });
  it("ett djur hörs en gång när det kommer inom hörhåll, inte igen", () => {
    const d = new SoundDirector();
    expect(d.update({ tMs: 0, player: me, headingDeg: 0, animals: [at(0, 300, "a")], events: [] })).toEqual([]);
    const c = d.update({ tMs: 1000, player: me, headingDeg: 0, animals: [at(0, 150, "a")], events: [] });
    expect(c).toHaveLength(1);
    expect(d.update({ tMs: 20_000, player: me, headingDeg: 0, animals: [at(0, 120, "a")], events: [] })).toEqual([]);
  });
  it("nedkylning och gruppering: tre djur på en gång ger ett ljud nu och högst ett till efter nedkylningen", () => {
    const d = new SoundDirector();
    const animals = [at(0, 100, "a"), at(50, 100, "b"), at(-50, 100, "c")];
    let n = 0;
    for (let t = 0; t <= AUDIO.cooldownMs + 1000; t += 500) n += d.update({ tMs: t, player: me, headingDeg: 0, animals, events: [] }).length;
    expect(n).toBe(1);
  });
  it("frys-förvarning, flykt, dykning och inflyttning har egna ljud och spelas direkt", () => {
    const d = new SoundDirector();
    const animals = [at(0, 40, "o", "otter"), at(0, 60, "e", "white_tailed_eagle")];
    const c = d.update({ tMs: 0, player: me, headingDeg: 0, animals, events: [
      { type: "look_warn", id: "o", tMs: 0 },
      { type: "flee", id: "e", distM: 60, tempo: "walk", tMs: 0 },
      { type: "gone", id: "o", reason: "dove", tMs: 0 },
      { type: "appear", id: "m", species: "hare", distM: 40, habitat: "forest", tMs: 0, via: "moved_in" },
    ] });
    expect(c.map((x) => x.kind)).toEqual(expect.arrayContaining(["warn", "wings", "splash", "chime"]));
  });
  it("ambient efter miljön", () => {
    expect(ambienceFor("forest", 500)).toBe("forest");
    expect(ambienceFor("urban", 500)).toBe("urban");
    expect(ambienceFor("urban", 30)).toBe("water");
    expect(ambienceFor("field", 500)).toBe("open");
  });
  it("ett djur inom hörhåll låter igen efter en stund (så att man kan leta på gehör), och lätet är artens inspelning", () => {
    const d = new SoundDirector();
    const c = d.update({ tMs: 0, player: me, headingDeg: 0, animals: [at(0, 100, "a", "roe_deer")], events: [] });
    expect(c[0].sample).toBe("roe_deer");
    expect(d.update({ tMs: AUDIO.repeatMs - 1000, player: me, headingDeg: 0, animals: [at(0, 100, "a", "roe_deer")], events: [] })).toEqual([]);
    expect(d.update({ tMs: AUDIO.repeatMs + 1000, player: me, headingDeg: 0, animals: [at(0, 100, "a", "roe_deer")], events: [] })).toHaveLength(1);
  });
  it("ett djur som stannar efter en flykt låter", () => {
    const d = new SoundDirector();
    const c = d.update({ tMs: 0, player: me, headingDeg: 0, animals: [at(0, 300, "a", "wild_boar")], events: [{ type: "halt", id: "a", tMs: 0 }] });
    expect(c.some((x) => x.sample === "wild_boar")).toBe(true);
  });
  it("bakgrund: fåglar och möss då och då efter miljö och dygn, svagt; ingen bakgrund utan miljö", () => {
    const d = new SoundDirector();
    const day: string[] = [], night: string[] = [];
    for (let t = 0; t <= 600_000; t += 1000) for (const c of d.update({ tMs: t, player: me, headingDeg: 0, animals: [], events: [], ambience: "forest" })) { day.push(c.sample!); expect(c.kind).toBe("ambient"); expect(c.gain).toBeLessThanOrEqual(AUDIO.backgroundGain[1]); }
    // 10 minuter: ett läte var 12–35 s.
    expect(day.length).toBeGreaterThanOrEqual(600 / 35 - 1);
    expect(day.length).toBeLessThanOrEqual(600 / 12 + 1);
    for (const x of day) expect(BACKGROUND.forest.day).toContain(x);
    expect(new Set(day).size).toBeGreaterThan(3);
    const n = new SoundDirector();
    for (let t = 0; t <= 600_000; t += 1000) for (const c of n.update({ tMs: t, player: me, headingDeg: 0, animals: [], events: [], ambience: "forest", night: true })) night.push(c.sample!);
    for (const x of night) expect(BACKGROUND.forest.night).toContain(x);
    const none = new SoundDirector();
    let k = 0;
    for (let t = 0; t <= 600_000; t += 1000) k += none.update({ tMs: t, player: me, headingDeg: 0, animals: [], events: [], ambience: "none" }).length;
    expect(k).toBe(0);
  });
  it("varje art och varje bakgrundsläte har en ljudfil (högst 100 kB)", () => {
    for (const id of [...ALL_SPECIES, ...BACKGROUND_SAMPLES]) {
      const f = path.join(import.meta.dirname, "..", "..", "..", "public", sampleUrl(id));
      expect(existsSync(f), id).toBe(true);
      expect(statSync(f).size, id).toBeLessThan(100_000);
    }
  });
});
